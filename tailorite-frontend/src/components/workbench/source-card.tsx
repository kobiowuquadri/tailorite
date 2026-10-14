"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AudioLines,
  BookmarkCheck,
  FileText,
  ImageIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { invalidateOrder } from "@/lib/queries";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";
import { toastError } from "@/lib/form-errors";
import { cn } from "@/lib/utils";
import { SOURCE_STATE_LABELS, type SourceDto } from "@/contracts/sources";
import { highlightRange, useEvidence } from "@/components/workbench/evidence";

const KIND_ICON = { TEXT: FileText, IMAGE: ImageIcon, AUDIO: AudioLines } as const;

function Highlighted({ text, parts }: { text: string; parts: [string, string, string] | null }) {
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <mark className="rounded bg-amber-tint px-0.5 text-foreground ring-1 ring-[#f6dfa3]" data-evidence-mark>
        {parts[1]}
      </mark>
      {parts[2]}
    </>
  );
}

export function SourceCard({
  source,
  orderId,
  timeZone,
  editable,
  selectedAsReference,
}: {
  source: SourceDto;
  orderId: string;
  timeZone: string;
  editable: boolean;
  selectedAsReference: boolean;
}) {
  const queryClient = useQueryClient();
  const { focus } = useEvidence();
  const cardRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const focused = focus?.evidence.sourceId === source.id ? focus : null;
  const [editingDetails, setEditingDetails] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [zoom, setZoom] = useState(false);
  const Icon = KIND_ICON[source.kind];

  useEffect(() => {
    if (!focused) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const e = focused.evidence;
    if (source.kind === "AUDIO" && audioRef.current && e.startMs !== null) {
      audioRef.current.currentTime = e.startMs / 1000;
      void audioRef.current.play().catch(() => undefined);
    }
  }, [focused, source.kind]);

  async function remove() {
    try {
      const result = await api<{ retained: boolean }>(`/orders/${orderId}/sources/${source.id}`, { method: "DELETE" });
      toast.success(
        result.retained ? `${source.label} removed from this list (kept because an agreement version uses it).` : `${source.label} removed`,
      );
      await invalidateOrder(queryClient, orderId);
    } catch (error) {
      toastError(error);
    }
  }

  const transcript = source.transcript;
  const evidenceInTranscript = focused && focused.evidence.transcriptId && transcript && focused.evidence.transcriptId !== transcript.id ? null : focused?.evidence ?? null;

  return (
    <article
      ref={cardRef}
      id={`source-${source.id}`}
      aria-label={source.label}
      className={cn(
        "rounded-xl border bg-white p-4 transition-shadow",
        focused ? "border-[#f6c34a] shadow-[0_0_0_3px_rgba(255,182,41,0.35)]" : "border-border",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-tint text-[#3d4757]">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{source.label}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[source.sender, source.context, formatDateTime(source.addedAt, timeZone)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {selectedAsReference ? (
            <Badge variant="secondary" className="gap-1">
              <BookmarkCheck className="size-3" /> For customer
            </Badge>
          ) : null}
          <Badge variant="outline" className={source.processingState === "FAILED" ? "border-[#f6c7c2] text-[#b42318]" : ""}>
            {SOURCE_STATE_LABELS[source.processingState]}
          </Badge>
          {editable ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${source.label}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditingDetails(true)}>
                  <Pencil /> Edit label and details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                  <Trash2 /> Remove from order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      <div className="mt-3">
        {source.kind === "TEXT" && source.text ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            <Highlighted text={source.text} parts={highlightRange(source.text, focused?.evidence ?? null)} />
          </p>
        ) : null}

        {source.kind === "IMAGE" && source.previewUrl ? (
          <div className="space-y-1">
            <button type="button" onClick={() => setZoom(true)} className="group relative block overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, authorized API image */}
              <img
                src={source.previewUrl}
                alt={`${source.label} (reference image)`}
                loading="lazy"
                className="max-h-64 w-full bg-canvas object-contain"
              />
              <span className="absolute right-2 top-2 rounded-md bg-white/90 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="size-4" aria-hidden="true" />
                <span className="sr-only">Enlarge</span>
              </span>
            </button>
            <p className="text-xs text-muted-foreground">
              {source.width}×{source.height} · {formatBytes(source.byteSize)} · A picture may show details the customer does not want — decide
              explicitly in the brief.
            </p>
          </div>
        ) : null}

        {source.kind === "AUDIO" && source.contentUrl ? (
          <div className="space-y-3">
            <audio ref={audioRef} controls preload="metadata" src={source.contentUrl} className="w-full" aria-label={`${source.label} audio`} />
            <p className="text-xs text-muted-foreground">
              {source.durationMs ? formatDuration(source.durationMs) : "Duration unknown"} · {formatBytes(source.byteSize)}
              {source.origin === "RECORDED" ? " · recorded in the browser" : ""}
            </p>
            <div className="rounded-lg bg-canvas p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {transcript
                    ? transcript.origin === "HUMAN"
                      ? `Transcript corrected by the studio${source.transcriptVersions > 1 ? " (original machine transcript kept)" : ""}`
                      : transcript.origin === "FIXTURE"
                        ? "Example transcript (demo fixture — not a live transcription)"
                        : `Machine transcript (${transcript.model ?? "AI"}) — may contain mistakes`
                    : "No transcript yet"}
                </p>
                {editable ? (
                  <Button variant="ghost" size="xs" onClick={() => setCorrecting(true)}>
                    <Pencil /> {transcript ? "Correct" : "Type transcript"}
                  </Button>
                ) : null}
              </div>
              {transcript ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  <Highlighted text={transcript.text} parts={highlightRange(transcript.text, evidenceInTranscript)} />
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Process the sources with AI, or type what was said.</p>
              )}
            </div>
          </div>
        ) : null}

        {source.processingError ? <p className="mt-2 text-xs text-[#b42318]">{source.processingError}</p> : null}
      </div>

      {editingDetails ? (
        <DetailsDialog source={source} orderId={orderId} onClose={() => setEditingDetails(false)} />
      ) : null}
      {correcting ? <TranscriptDialog source={source} orderId={orderId} onClose={() => setCorrecting(false)} /> : null}
      {zoom && source.previewUrl ? (
        <Dialog open onOpenChange={setZoom}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{source.label}</DialogTitle>
              <DialogDescription>Reference image. Metadata such as location has been removed from this preview.</DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element -- private, authorized API image */}
            <img src={source.previewUrl} alt={source.label} className="max-h-[70vh] w-full object-contain" />
          </DialogContent>
        </Dialog>
      ) : null}
    </article>
  );
}

function DetailsDialog({ source, orderId, onClose }: { source: SourceDto; orderId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(source.label);
  const [sender, setSender] = useState(source.sender ?? "");
  const [context, setContext] = useState(source.context ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/orders/${orderId}/sources/${source.id}`, { method: "PATCH", body: { label, sender, context } });
      await invalidateOrder(queryClient, orderId);
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit source details</DialogTitle>
          <DialogDescription>The original content cannot be changed; only its label and context.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="src-label">Label</Label>
            <Input id="src-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="src-sender">From</Label>
            <Input id="src-sender" value={sender} onChange={(e) => setSender(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="src-context">Context</Label>
            <Input id="src-context" value={context} onChange={(e) => setContext(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !label.trim()}>
            {busy ? <Spinner /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TranscriptDialog({ source, orderId, onClose }: { source: SourceDto; orderId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(source.transcript?.text ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/orders/${orderId}/sources/${source.id}/transcripts`, {
        method: "POST",
        body: { text, basedOnTranscriptId: source.transcript?.id ?? null },
      });
      toast.success("Transcript saved. Run AI processing again to use the corrected text.");
      await invalidateOrder(queryClient, orderId);
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{source.transcript ? "Correct the transcript" : "Type the transcript"}</DialogTitle>
          <DialogDescription>
            Your version is saved as a studio correction. The original {source.transcript?.origin === "MACHINE" ? "machine " : ""}transcript is kept.
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} aria-label="Transcript text" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !text.trim()}>
            {busy ? <Spinner /> : null} Save transcript
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
