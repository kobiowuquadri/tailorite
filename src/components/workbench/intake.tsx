"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardPaste, FileUp, Mic, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { VoiceRecorder } from "@/components/workbench/voice-recorder";
import { api, newIdempotencyKey, uploadWithProgress } from "@/lib/api";
import { invalidateOrder } from "@/lib/queries";
import { formatBytes } from "@/lib/format";
import { toastError } from "@/lib/form-errors";
import type { SourceDto, UploadPolicyDto } from "@/contracts/sources";

type Upload = { id: string; name: string; progress: number; error?: string };

export function Intake({ orderId, policy, disabled }: { orderId: string; policy: UploadPolicyDto; disabled?: boolean }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"paste" | "record" | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const accept = [...policy.acceptedImageTypes, ...policy.acceptedAudioTypes, ".mp3", ".m4a", ".wav", ".ogg", ".webm", ".flac", ".aac"].join(",");

  async function uploadFile(file: File, origin: "UPLOADED" | "RECORDED") {
    const id = newIdempotencyKey();
    setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
    const form = new FormData();
    form.append("origin", origin);
    form.append("idempotencyKey", id);
    form.append("file", file);
    try {
      const result = await uploadWithProgress<{ source: SourceDto; duplicate: boolean }>(
        `/orders/${orderId}/sources/files`,
        form,
        (p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))),
      );
      setUploads((u) => u.filter((x) => x.id !== id));
      if (result.duplicate) toast.info(`${file.name} was already added to this order.`);
      else toast.success(`${result.source.label} added`);
      await invalidateOrder(queryClient, orderId);
    } catch (error) {
      setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: (error as Error).message } : x)));
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      const limit = isImage ? policy.imageMaxBytes : policy.audioMaxBytes;
      if (file.size > limit) {
        setUploads((u) => [
          ...u,
          { id: newIdempotencyKey(), name: file.name, progress: 0, error: `Larger than the ${formatBytes(limit)} limit for ${isImage ? "images" : "audio"}.` },
        ]);
        continue;
      }
      await uploadFile(file, "UPLOADED");
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  const full = policy.sourceCount >= policy.maxSources;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setMode("paste")} disabled={disabled || full}>
          <ClipboardPaste /> Paste message
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={disabled || full}>
          <FileUp /> Upload images or audio
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setMode(mode === "record" ? null : "record")} disabled={disabled || full}>
          <Mic /> Record voice note
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          aria-label="Upload images or audio"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Only add messages, pictures and recordings you have permission to use. Files stay private to your studio. Images up to{" "}
        {formatBytes(policy.imageMaxBytes)} (JPEG, PNG, WebP); audio up to {formatBytes(policy.audioMaxBytes)} ({policy.audioFormatHelp}).
      </p>
      {full ? <p className="text-xs font-medium text-coral-ink">This order has reached its {policy.maxSources}-source limit.</p> : null}

      {mode === "record" ? (
        <div className="rounded-lg border border-border bg-white p-3">
          <VoiceRecorder
            maxSeconds={policy.recordingMaxSeconds}
            onRecorded={async (file) => {
              await uploadFile(file, "RECORDED");
              setMode(null);
            }}
          />
        </div>
      ) : null}

      {uploads.length ? (
        <ul className="space-y-2" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.id} className="rounded-lg border border-border bg-white p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{u.name}</span>
                {u.error ? (
                  <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))}>
                    Dismiss
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">{Math.round(u.progress * 100)}%</span>
                )}
              </div>
              {u.error ? <p className="mt-1 text-xs text-[#b42318]">{u.error}</p> : <Progress value={u.progress * 100} className="mt-1" />}
            </li>
          ))}
        </ul>
      ) : null}

      <PasteDialog open={mode === "paste"} onOpenChange={(o) => setMode(o ? "paste" : null)} orderId={orderId} maxChars={policy.textMaxChars} />
    </div>
  );
}

function PasteDialog({
  open,
  onOpenChange,
  orderId,
  maxChars,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  maxChars: number;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sender, setSender] = useState("Customer");
  const [context, setContext] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);

  async function save() {
    setBusy(true);
    try {
      const result = await api<{ source: SourceDto; duplicate: boolean }>(`/orders/${orderId}/sources/text`, {
        method: "POST",
        body: { text, sender, context, label: label || undefined, idempotencyKey: key },
      });
      if (result.duplicate) toast.info("This message was already added.");
      else toast.success(`${result.source.label} added`);
      await invalidateOrder(queryClient, orderId);
      setText("");
      setContext("");
      setLabel("");
      setKey(newIdempotencyKey());
      onOpenChange(false);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Paste a message</DialogTitle>
          <DialogDescription>Paste only the messages that describe this order. The original text is kept exactly as pasted.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="paste-text">Message</Label>
            <Textarea id="paste-text" rows={7} value={text} maxLength={maxChars} onChange={(e) => setText(e.target.value)} />
            <p className="text-right text-xs text-muted-foreground tabular">
              {text.length.toLocaleString()} / {maxChars.toLocaleString()}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="paste-sender">From</Label>
              <Input id="paste-sender" value={sender} onChange={(e) => setSender(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="paste-context">Context (optional)</Label>
              <Input id="paste-context" value={context} onChange={(e) => setContext(e.target.value)} placeholder="WhatsApp, 12 Oct" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="paste-label">Label (optional)</Label>
              <Input id="paste-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Message 1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !text.trim()}>
            {busy ? <Spinner /> : null} Add message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
