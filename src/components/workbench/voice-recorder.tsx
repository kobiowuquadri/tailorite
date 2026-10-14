"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { formatDuration } from "@/lib/format";

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

function extensionFor(mime: string) {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  return "webm";
}

type State =
  | { kind: "idle" }
  | { kind: "unsupported" }
  | { kind: "denied"; message: string }
  | { kind: "recording"; startedAt: number }
  | { kind: "recorded"; blob: Blob; url: string; durationMs: number };

/**
 * Records a voice note in the browser (with permission). Falls back to file upload when the
 * browser cannot record. Recordings are capped at `maxSeconds`.
 */
export function VoiceRecorder({
  maxSeconds,
  onRecorded,
  busy,
}: {
  maxSeconds: number;
  onRecorded: (file: File, durationMs: number) => Promise<void> | void;
  busy?: boolean;
}) {
  const [state, setState] = useState<State>(() =>
    typeof window !== "undefined" && (!navigator.mediaDevices?.getUserMedia || !pickMimeType()) ? { kind: "unsupported" } : { kind: "idle" },
  );
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const tick = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      window.clearInterval(tick.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (state.kind === "recorded") URL.revokeObjectURL(state.url);
    };
  }, [state]);

  async function start() {
    const mimeType = pickMimeType();
    if (!mimeType) {
      setState({ kind: "unsupported" });
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const name = (error as DOMException).name;
      setState({
        kind: "denied",
        message:
          name === "NotAllowedError" || name === "SecurityError"
            ? "Microphone access was blocked. Allow the microphone for this site in your browser settings, or upload an audio file instead."
            : name === "NotFoundError"
              ? "No microphone was found. Connect one, or upload an audio file instead."
              : "The microphone could not be started. Upload an audio file instead.",
      });
      return;
    }
    chunks.current = [];
    const rec = new MediaRecorder(stream.current, { mimeType });
    recorder.current = rec;
    const startedAt = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      window.clearInterval(tick.current);
      stream.current?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: mimeType.split(";")[0] });
      setState({ kind: "recorded", blob, url: URL.createObjectURL(blob), durationMs: Date.now() - startedAt });
    };
    rec.start(1000);
    setElapsed(0);
    setState({ kind: "recording", startedAt });
    tick.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(seconds);
      if (seconds >= maxSeconds) rec.stop();
    }, 250);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function add() {
    if (state.kind !== "recorded") return;
    const type = state.blob.type || "audio/webm";
    const file = new File([state.blob], `voice-note-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${extensionFor(type)}`, {
      type,
    });
    await onRecorded(file, state.durationMs);
    setState({ kind: "idle" });
  }

  if (state.kind === "unsupported") {
    return (
      <Alert>
        <Upload />
        <AlertDescription>Recording is not available in this browser. Upload an audio file instead.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {state.kind === "denied" ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.kind === "recording" ? (
        <div className="space-y-2 rounded-lg border border-[#ffcfc6] bg-coral-tint p-3">
          <div className="flex items-center justify-between text-sm font-medium text-coral-ink">
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 animate-pulse rounded-full bg-[#d92d20]" aria-hidden="true" /> Recording
            </span>
            <span className="tabular" aria-live="polite">
              {formatDuration(elapsed * 1000)} / {formatDuration(maxSeconds * 1000)}
            </span>
          </div>
          <Progress value={(elapsed / maxSeconds) * 100} aria-label="Recording length" />
          <Button type="button" variant="outline" onClick={stop}>
            <Square /> Stop recording
          </Button>
        </div>
      ) : state.kind === "recorded" ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <audio controls src={state.url} className="w-full" aria-label="Recorded voice note preview" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={add} disabled={busy}>
              Add voice note
            </Button>
            <Button type="button" variant="outline" onClick={() => setState({ kind: "idle" })} disabled={busy}>
              <RotateCcw /> Discard and re-record
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={start}>
          <Mic /> Record a voice note
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Up to {Math.round(maxSeconds / 60)} minutes. You can listen before adding it.</p>
    </div>
  );
}
