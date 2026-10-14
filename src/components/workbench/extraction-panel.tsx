"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleAlert, CircleCheck, Info, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, newIdempotencyKey } from "@/lib/api";
import { invalidateOrder, qk } from "@/lib/queries";
import { toastError } from "@/lib/form-errors";
import type { AiStatusDto } from "@/contracts/studio";
import type { ExtractionJobDto, ExtractionOverviewDto } from "@/contracts/extraction";

function JobStatus({ job }: { job: ExtractionJobDto }) {
  if (job.status === "QUEUED" || job.status === "RUNNING") {
    return (
      <p className="flex items-center gap-2 text-sm text-blue-ink" role="status" aria-live="polite">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {job.status === "QUEUED" ? "Waiting to start…" : "Reading messages, transcribing voice notes and looking at pictures…"}
        {job.attempts > 1 ? ` (attempt ${job.attempts} of ${job.maxAttempts})` : ""}
      </p>
    );
  }
  if (job.status === "FAILED") {
    return (
      <p className="flex items-start gap-2 text-sm text-[#b42318]" role="status">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {job.errorMessage ?? "Processing failed."} Your brief was not changed.
      </p>
    );
  }
  if (job.status === "SUCCEEDED" && job.result) {
    return (
      <div className="space-y-1 text-sm" role="status">
        <p className="flex items-center gap-2 text-teal-ink">
          <CircleCheck className="size-4" aria-hidden="true" />
          {job.result.isExample ? "Example results loaded" : "Processing finished"}: {job.result.suggestionCount} suggestion
          {job.result.suggestionCount === 1 ? "" : "s"} and {job.result.issueCount} question{job.result.issueCount === 1 ? "" : "s"} to review.
        </p>
        {job.result.evidenceRejected ? (
          <p className="text-xs text-muted-foreground">
            {job.result.evidenceRejected} quote{job.result.evidenceRejected === 1 ? "" : "s"} could not be found in the sources and were not linked.
          </p>
        ) : null}
        {job.result.warnings.map((w, i) => (
          <p key={i} className="text-xs text-amber-ink">
            {w}
          </p>
        ))}
        {job.durationMs ? (
          <p className="text-xs text-muted-foreground">
            {job.result.isExample ? "Demo fixture" : `${job.provider} · ${job.model}`} · {(job.durationMs / 1000).toFixed(1)} s
          </p>
        ) : null}
      </div>
    );
  }
  return null;
}

/** Starts and tracks AI processing. Suggestions never change the brief until a person accepts them. */
export function ExtractionPanel({
  orderId,
  overview,
  ai,
  disabled,
}: {
  orderId: string;
  overview: ExtractionOverviewDto | undefined;
  ai: AiStatusDto | undefined;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const latest = overview?.latest ?? null;
  const running = latest && (latest.status === "QUEUED" || latest.status === "RUNNING");

  async function start() {
    setBusy(true);
    try {
      await api(`/orders/${orderId}/extractions`, { method: "POST", body: { idempotencyKey: newIdempotencyKey() } });
      await queryClient.invalidateQueries({ queryKey: qk.extraction(orderId) });
      await queryClient.invalidateQueries({ queryKey: qk.sources(orderId) });
      void queryClient.invalidateQueries({ queryKey: qk.aiStatus });
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  async function retry(jobId: string) {
    setBusy(true);
    try {
      await api(`/orders/${orderId}/extractions/${jobId}/retry`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: qk.extraction(orderId) });
      toast.info("Trying again");
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  // When a job finishes, refresh the brief (suggestions/issues) and sources (transcripts).
  const latestKey = latest ? `${latest.id}:${latest.status}` : "";
  const finished = latest?.status === "SUCCEEDED" || latest?.status === "FAILED";
  const previousKey = useRef(latestKey);
  useEffect(() => {
    if (previousKey.current !== latestKey && finished) void invalidateOrder(queryClient, orderId);
    previousKey.current = latestKey;
  }, [latestKey, finished, orderId, queryClient]);

  return (
    <section aria-labelledby="ai-title" className="space-y-3 rounded-xl border border-[#c9dcff] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="ai-title" className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" /> {ai?.mode === "fixture" ? "Example draft" : "AI draft"}
        </h2>
        {ai ? <span className="text-xs font-medium text-muted-foreground">{ai.label}</span> : null}
      </div>
      {!ai ? (
        <p className="text-sm text-muted-foreground">Checking availability…</p>
      ) : !ai.available ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {ai.message}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {ai.mode === "fixture"
              ? "Demo mode: loads prepared example results for the synthetic demo sources. They are labelled as examples."
              : "Sends this order's messages, pictures and voice notes to Google Gemini to propose brief details linked to the exact words or pictures. You review every suggestion."}
          </p>
          {latest ? <JobStatus job={latest} /> : null}
          {!ai.worker.online ? (
            <p className="flex items-start gap-2 rounded-lg bg-amber-tint p-2.5 text-xs text-amber-ink" role="status">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              The background worker is not running, so processing waits in the queue until it starts. You can keep filling in the brief by
              hand.
            </p>
          ) : null}
          {overview?.sourcesChangedSinceLatest && latest?.status === "SUCCEEDED" ? (
            <p className="text-xs text-amber-ink">Sources changed since the last run. Process again to include them.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={start} disabled={disabled || busy || Boolean(running) || overview?.canStart === false}>
              {busy ? <Spinner /> : <Sparkles />}{" "}
              {latest ? "Process again" : ai.mode === "fixture" ? "Load example results" : "Draft the brief with AI"}
            </Button>
            {latest?.status === "FAILED" && latest.retryable ? (
              <Button variant="outline" onClick={() => retry(latest.id)} disabled={busy}>
                <RotateCcw /> Retry
              </Button>
            ) : null}
          </div>
          {overview?.cannotStartReason && !running ? <p className="text-xs text-muted-foreground">{overview.cannotStartReason}</p> : null}
          <p className="text-xs text-muted-foreground">
            {ai.limits.usedToday} of {ai.limits.jobsPerDay} runs used today · up to {ai.limits.maxSourcesPerJob} sources per run
          </p>
        </>
      )}
    </section>
  );
}
