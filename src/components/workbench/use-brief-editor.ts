"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { BriefContent, BriefDto } from "@/contracts/brief";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

/**
 * Local editing state for the working brief with debounced autosave. Every save carries the
 * expected revision; a 409 means the brief changed elsewhere and the person must reload.
 * Server-side actions first flush pending edits so nothing typed is lost or overwritten.
 */
export function useBriefEditor(orderId: string, initial: BriefDto) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState<BriefContent>(initial.content);
  const [internalNotes, setInternalNotes] = useState<string | null>(initial.internalNotes);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const revision = useRef(initial.revision);
  const dirty = useRef(false);
  const contentRef = useRef(content);
  const notesRef = useRef(internalNotes);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<number | undefined>(undefined);
  const statusRef = useRef<SaveStatus>("saved");

  const setStatusBoth = (s: SaveStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const flush = useCallback((): Promise<void> => {
    window.clearTimeout(timer.current);
    queue.current = queue.current.then(async () => {
      if (!dirty.current || statusRef.current === "conflict") return;
      dirty.current = false;
      setStatusBoth("saving");
      try {
        const res = await api<BriefDto>(`/orders/${orderId}/brief`, {
          method: "PUT",
          body: { expectedRevision: revision.current, content: contentRef.current, internalNotes: notesRef.current },
        });
        revision.current = res.revision;
        // Keep the person's latest keystrokes; take readiness, issues and status from the server.
        queryClient.setQueryData(qk.brief(orderId), res);
        void queryClient.invalidateQueries({ queryKey: qk.order(orderId) });
        setStatusBoth(dirty.current ? "dirty" : "saved");
      } catch (error) {
        if (isApiError(error, "STALE_REVISION")) {
          setStatusBoth("conflict");
        } else {
          dirty.current = true;
          setStatusBoth("error");
        }
      }
    });
    return queue.current;
  }, [orderId, queryClient]);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 900);
  }, [flush]);

  const update = useCallback(
    (fn: (current: BriefContent) => BriefContent) => {
      setContent((current) => {
        const next = fn(current);
        contentRef.current = next;
        return next;
      });
      dirty.current = true;
      if (statusRef.current !== "conflict") setStatusBoth("dirty");
      schedule();
    },
    [schedule],
  );

  const updateNotes = useCallback(
    (value: string) => {
      notesRef.current = value;
      setInternalNotes(value);
      dirty.current = true;
      if (statusRef.current !== "conflict") setStatusBoth("dirty");
      schedule();
    },
    [schedule],
  );

  /** Replace local state with the server's (after actions or a conflict reload). */
  const adopt = useCallback(
    (dto: BriefDto) => {
      revision.current = dto.revision;
      contentRef.current = dto.content;
      notesRef.current = dto.internalNotes;
      setContent(dto.content);
      setInternalNotes(dto.internalNotes);
      dirty.current = false;
      setStatusBoth("saved");
      queryClient.setQueryData(qk.brief(orderId), dto);
    },
    [orderId, queryClient],
  );

  /** Runs a server action against the latest saved revision and adopts its result. */
  const runAction = useCallback(
    async (fn: (expectedRevision: number) => Promise<BriefDto>): Promise<BriefDto> => {
      await flush();
      if (statusRef.current === "conflict") throw new Error("Reload the brief before continuing.");
      if (statusRef.current === "error") throw new Error("Your latest edits are not saved yet. Try again in a moment.");
      const dto = await fn(revision.current);
      adopt(dto);
      void queryClient.invalidateQueries({ queryKey: qk.order(orderId) });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      return dto;
    },
    [flush, adopt, orderId, queryClient],
  );

  const reload = useCallback(async () => {
    const dto = await api<BriefDto>(`/orders/${orderId}/brief`);
    adopt(dto);
  }, [orderId, adopt]);

  // Save on leave and warn before closing the tab with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || statusRef.current === "saving") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (dirty.current) void flush();
    };
  }, [flush]);

  return {
    content,
    internalNotes,
    status,
    revision: () => revision.current,
    update,
    updateNotes,
    flush,
    runAction,
    reload,
    adopt,
  };
}

export type BriefEditor = ReturnType<typeof useBriefEditor>;
