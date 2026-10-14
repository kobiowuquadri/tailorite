"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AudioLines, FileText, ImageIcon, Quote } from "lucide-react";
import type { Evidence } from "@/contracts/brief";
import type { SourceDto } from "@/contracts/sources";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

type Focus = { evidence: Evidence; nonce: number } | null;

type EvidenceContextValue = {
  focus: Focus;
  sources: Map<string, SourceDto>;
  focusEvidence: (evidence: Evidence) => void;
  clear: () => void;
};

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

export function EvidenceProvider({
  sources,
  onFocus,
  children,
}: {
  sources: SourceDto[];
  onFocus?: () => void;
  children: ReactNode;
}) {
  const [focus, setFocus] = useState<Focus>(null);
  const map = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const focusEvidence = useCallback(
    (evidence: Evidence) => {
      setFocus({ evidence, nonce: Date.now() });
      onFocus?.();
    },
    [onFocus],
  );
  const value = useMemo(
    () => ({ focus, sources: map, focusEvidence, clear: () => setFocus(null) }),
    [focus, map, focusEvidence],
  );
  return <EvidenceContext value={value}>{children}</EvidenceContext>;
}

export function useEvidence() {
  const ctx = useContext(EvidenceContext);
  if (!ctx) throw new Error("useEvidence must be used inside EvidenceProvider");
  return ctx;
}

const ICON = { TEXT: FileText, IMAGE: ImageIcon, AUDIO: AudioLines } as const;

/** Clickable links from a brief value to the original material. */
export function EvidenceChips({ evidence, className }: { evidence: Evidence[]; className?: string }) {
  const { sources, focusEvidence } = useEvidence();
  if (!evidence.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Evidence">
      {evidence.map((e, i) => {
        const source = sources.get(e.sourceId);
        const Icon = source ? ICON[source.kind] : Quote;
        const timed = e.startMs !== null && source?.kind === "AUDIO";
        return (
          <li key={`${e.sourceId}-${i}`}>
            <button
              type="button"
              onClick={() => focusEvidence(e)}
              disabled={!source}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-white px-2 py-0.5 text-xs text-[#3d4757] transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-60"
              title={e.quote ? `“${e.quote}”` : undefined}
            >
              <Icon className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{source ? source.label : "Source removed"}</span>
              {timed ? <span className="tabular text-muted-foreground">{formatDuration(e.startMs)}</span> : null}
              {e.quote ? <span className="hidden max-w-40 truncate italic text-muted-foreground sm:inline">“{e.quote}”</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Splits text into [before, match, after] for highlighting an evidence quote or range. */
export function highlightRange(text: string, evidence: Evidence | null): [string, string, string] | null {
  if (!evidence) return null;
  let start = evidence.charStart;
  let end = evidence.charEnd;
  if (start === null || end === null || end > text.length || start >= end) {
    if (!evidence.quote) return null;
    const idx = text.toLowerCase().indexOf(evidence.quote.toLowerCase());
    if (idx === -1) return null;
    start = idx;
    end = idx + evidence.quote.length;
  }
  return [text.slice(0, start), text.slice(start, end), text.slice(end)];
}
