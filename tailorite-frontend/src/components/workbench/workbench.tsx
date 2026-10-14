"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleAlert,
  CloudCheck,
  GitCompareArrows,
  Loader2,
  Lock,
  Printer,
  RefreshCw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AgreementBadge } from "@/components/status/status-badge";
import { EvidenceProvider } from "@/components/workbench/evidence";
import { Intake } from "@/components/workbench/intake";
import { SourceCard } from "@/components/workbench/source-card";
import { useBriefEditor, type SaveStatus } from "@/components/workbench/use-brief-editor";
import {
  DesignSection,
  ExclusionsSection,
  ExtrasSection,
  FabricSection,
  GarmentSection,
  MeasurementsSection,
  NotesSection,
  problemsFrom,
  ReferencesSection,
  TermsSection,
} from "@/components/workbench/brief-sections";
import { IssuesPanel, ReadinessPanel, SuggestionsPanel } from "@/components/workbench/review-panels";
import { PublishDialog } from "@/components/workbench/publish-dialog";
import { ExtractionPanel } from "@/components/workbench/extraction-panel";
import { useMediaQuery } from "@/lib/use-media-query";
import { qk, useAiStatus } from "@/lib/queries";
import type { BriefDto } from "@/contracts/brief";
import type { SourcesDto } from "@/contracts/sources";
import type { OrderDetailDto } from "@/contracts/orders";
import type { ExtractionOverviewDto } from "@/contracts/extraction";
import { api } from "@/lib/api";

function SaveIndicator({ status, onRetry, onReload }: { status: SaveStatus; onRetry: () => void; onReload: () => void }) {
  if (status === "saving" || status === "dirty") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> {status === "saving" ? "Saving…" : "Unsaved changes"}
      </span>
    );
  }
  if (status === "error") {
    return (
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#b42318]" role="status">
        <CircleAlert className="size-3.5" aria-hidden="true" /> Not saved — retry
      </button>
    );
  }
  if (status === "conflict") {
    return (
      <button type="button" onClick={onReload} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#b42318]" role="status">
        <RefreshCw className="size-3.5" aria-hidden="true" /> Changed elsewhere — reload
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      <CloudCheck className="size-3.5" aria-hidden="true" /> Saved
    </span>
  );
}

export function Workbench({
  orderId,
  initialBrief,
  sources,
  order,
  timeZone,
}: {
  orderId: string;
  initialBrief: BriefDto;
  sources: SourcesDto;
  order: OrderDetailDto;
  timeZone: string;
}) {
  const editor = useBriefEditor(orderId, initialBrief);
  // Readiness, issues and suggestions always come from the latest server response.
  const brief = useQuery({ queryKey: qk.brief(orderId), queryFn: () => api<BriefDto>(`/orders/${orderId}/brief`), initialData: initialBrief }).data;
  const extraction = useQuery({
    queryKey: qk.extraction(orderId),
    queryFn: () => api<ExtractionOverviewDto>(`/orders/${orderId}/extractions`),
    refetchInterval: (q) => (q.state.data?.latest && ["QUEUED", "RUNNING"].includes(q.state.data.latest.status) ? 2500 : false),
  });
  const ai = useAiStatus();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [tab, setTab] = useState<"sources" | "brief">("brief");
  const [publishing, setPublishing] = useState(false);
  const disabled = !brief.editable;
  const problems = useMemo(() => problemsFrom(brief.readiness.blocking), [brief.readiness.blocking]);
  const images = sources.sources.filter((s) => s.kind === "IMAGE");
  const selectedRefs = new Set(editor.content.references.map((r) => r.sourceId));
  const isRevision = Boolean(brief.changeRequestId);
  const latestResult = extraction.data?.latest?.result ?? null;

  const sourcesPanel = (
    <div className="space-y-4">
      <ExtractionPanel orderId={orderId} overview={extraction.data} ai={ai.data} disabled={disabled || sources.sources.length === 0} />
      <div className="rounded-xl border border-border bg-white p-4">
        <h2 className="mb-3 font-semibold">Customer material ({sources.sources.length})</h2>
        <Intake orderId={orderId} policy={sources.policy} disabled={order.productionStatus === "CANCELLED" || Boolean(order.archivedAt)} />
      </div>
      {sources.sources.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-white p-6 text-center text-sm text-muted-foreground">
          Paste the customer&apos;s messages, upload reference pictures and voice notes, or record one. They stay private to your studio.
        </p>
      ) : (
        sources.sources.map((s) => (
          <SourceCard
            key={s.id}
            source={s}
            orderId={orderId}
            timeZone={timeZone}
            editable={order.productionStatus !== "CANCELLED" && !order.archivedAt}
            selectedAsReference={selectedRefs.has(s.id)}
          />
        ))
      )}
    </div>
  );

  const sectionProps = { editor, disabled, problems };
  const briefPanel = (
    <div className="space-y-4">
      <ReadinessPanel readiness={brief.readiness} />
      <SuggestionsPanel
        suggestions={brief.suggestions}
        editor={editor}
        orderId={orderId}
        disabled={disabled}
        isExample={Boolean(latestResult?.isExample)}
        staleNotice={latestResult?.stale ? latestResult.staleReason : null}
      />
      <IssuesPanel
        brief={brief}
        editor={editor}
        orderId={orderId}
        disabled={disabled}
        timeZone={timeZone}
        isExample={Boolean(latestResult?.isExample)}
      />
      <GarmentSection {...sectionProps} customerName={brief.customer.name} />
      <DesignSection {...sectionProps} />
      <FabricSection {...sectionProps} />
      <ExtrasSection {...sectionProps} />
      <ExclusionsSection {...sectionProps} />
      <ReferencesSection {...sectionProps} images={images} />
      <MeasurementsSection {...sectionProps} brief={brief} orderId={orderId} />
      <TermsSection {...sectionProps} />
      <NotesSection {...sectionProps} />
    </div>
  );

  return (
    <EvidenceProvider sources={sources.sources} onFocus={() => !desktop && setTab("sources")}>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <Link href={`/orders/${orderId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
              <ArrowLeft className="size-4" aria-hidden="true" /> {order.reference} · {order.customer.name}
            </Link>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{order.title}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <AgreementBadge status={order.agreementStatus} />
              {!disabled ? <SaveIndicator status={editor.status} onRetry={() => void editor.flush()} onReload={() => void editor.reload()} /> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="lg">
              <Link href={`/print/orders/${orderId}/draft`}>
                <Printer /> Print draft
              </Link>
            </Button>
            {!disabled ? (
              <Button
                size="lg"
                onClick={async () => {
                  await editor.flush();
                  setPublishing(true);
                }}
              >
                <Send /> {isRevision ? "Share change for approval" : "Share for review"}
              </Button>
            ) : null}
          </div>
        </div>

        {editor.status === "conflict" ? (
          <Alert variant="destructive">
            <RefreshCw />
            <AlertTitle>This brief was changed elsewhere</AlertTitle>
            <AlertDescription>
              Another tab or action saved a newer version. Reload to continue — your unsaved edits on this screen will be replaced.
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void editor.reload()}>
                Reload latest brief
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {disabled && brief.lockReason ? (
          <Alert>
            <Lock />
            <AlertTitle>Read-only</AlertTitle>
            <AlertDescription>
              {brief.lockReason}
              {order.activeVersion && !brief.changeRequestId && order.productionStatus !== "CANCELLED" ? (
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link href={`/orders/${orderId}#agreement`}>Go to the order to propose a change</Link>
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {isRevision ? (
          <Alert className="border-[#ffcfc6] bg-coral-tint/60">
            <GitCompareArrows />
            <AlertTitle>Preparing a change to approved version {brief.baseVersionNumber}</AlertTitle>
            <AlertDescription>
              Version {brief.baseVersionNumber} stays the agreement until the customer accepts this change. Update the design, price and
              delivery date here, then share it for approval.
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href={`/orders/${orderId}#change`}>See the comparison</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {brief.pendingVersion && !isRevision ? (
          <Alert>
            <AlertDescription>
              Version {brief.pendingVersion.number} is with the customer. Edits here do not change it; sharing again creates a new version and
              replaces the old link.
            </AlertDescription>
          </Alert>
        ) : null}

        {desktop ? (
          <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-6">
            <aside aria-label="Sources" className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto pr-1">
              {sourcesPanel}
            </aside>
            <div aria-label="Brief">{briefPanel}</div>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "sources" | "brief")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sources">Sources ({sources.sources.length})</TabsTrigger>
              <TabsTrigger value="brief">
                Brief {brief.readiness.ready ? "· ready" : `· ${brief.readiness.blocking.length} to do`}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="sources" className="mt-4">
              {sourcesPanel}
            </TabsContent>
            <TabsContent value="brief" className="mt-4">
              {briefPanel}
            </TabsContent>
          </Tabs>
        )}

        <PublishDialog
          open={publishing}
          onOpenChange={setPublishing}
          brief={brief}
          editor={editor}
          orderId={orderId}
          customerName={brief.customer.name}
          timeZone={timeZone}
          isRevision={isRevision}
        />
      </div>
    </EvidenceProvider>
  );
}
