"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Ban, GitCompareArrows, Hourglass, MessageSquareText, Printer, Undo2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { PresentedBrief } from "@/components/brief/presented-brief";
import { ComparisonView } from "@/components/order/comparison-view";
import { shortHash } from "@/components/order/agreement-section";
import { api, isApiError } from "@/lib/api";
import { qk, useSession } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { VERSION_STATUS_LABELS, type VersionStatus } from "@/contracts/orders";
import type { VersionDetailDto } from "@/contracts/approvals";

const STATUS_ALERT: Record<VersionStatus, { icon: LucideIcon; className: string }> = {
  APPROVED: { icon: BadgeCheck, className: "border-[#b6ebe6] bg-teal-tint/60" },
  AWAITING_APPROVAL: { icon: Hourglass, className: "border-[#c9dcff] bg-blue-tint/60" },
  CHANGES_REQUESTED: { icon: MessageSquareText, className: "border-[#ffcfc6] bg-coral-tint/60" },
  DECLINED: { icon: Ban, className: "border-[#f6c7c2] bg-[#fdecea]" },
  SUPERSEDED: { icon: GitCompareArrows, className: "" },
  WITHDRAWN: { icon: Undo2, className: "" },
};

function statusTitle(v: VersionDetailDto): string {
  if (v.status === "APPROVED") return v.isActive ? "Approved — this is the agreement in force" : "Approved earlier — later replaced by an approved change";
  if (v.status === "AWAITING_APPROVAL") return "Waiting for the customer — not agreed yet";
  return VERSION_STATUS_LABELS[v.status];
}

export default function VersionPage() {
  const { orderId, versionId } = useParams<{ orderId: string; versionId: string }>();
  const session = useSession();
  const timeZone = session.data?.studio?.timeZone ?? "Africa/Lagos";
  const version = useQuery({
    queryKey: qk.version(orderId, versionId),
    queryFn: () => api<VersionDetailDto>(`/orders/${orderId}/versions/${versionId}`),
  });

  if (version.isPending) return <PageSkeleton rows={6} />;
  if (version.error) {
    return isApiError(version.error, "NOT_FOUND") ? (
      <ErrorState error={version.error} title="Version not found" />
    ) : (
      <ErrorState error={version.error} onRetry={() => version.refetch()} />
    );
  }
  const v = version.data;
  const meta = STATUS_ALERT[v.status];
  const changed = new Set(v.comparisonToBase?.fields.map((f) => f.key) ?? []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow={
          <Link href={`/orders/${orderId}`} className="hover:text-primary">
            {v.order.reference} · {v.order.title}
          </Link>
        }
        title={`Version ${v.number}${v.kind === "REVISION" ? ` — change to version ${v.basedOnVersionNumber}` : ""}`}
        description={`For ${v.customerName} · shared ${formatDateTime(v.publishedAt, timeZone)} · Ref ${shortHash(v.contentHash)}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/print/orders/${orderId}/versions/${versionId}`}>
              <Printer /> {v.status === "APPROVED" ? "Print / save PDF" : "Print (marked not approved)"}
            </Link>
          </Button>
        }
      />

      <Alert className={meta.className}>
        <meta.icon />
        <AlertTitle>{statusTitle(v)}</AlertTitle>
        <AlertDescription>
          {v.decision ? (
            <p>
              {v.decision.decision === "APPROVED" ? "Approved" : v.decision.decision === "DECLINED" ? "Declined" : "Changes requested"} by the
              person who typed the name “{v.decision.customerName}” on {formatDateTime(v.decision.at, timeZone)}.
              {v.decision.comment ? <span className="mt-1 block">“{v.decision.comment}”</span> : null}
            </p>
          ) : v.status === "AWAITING_APPROVAL" ? (
            <p>This is exactly what the customer sees on their review page. It cannot be edited; changes need a new version.</p>
          ) : (
            <p>This version can no longer be approved. It is kept for the record.</p>
          )}
          <p className="mt-1 text-xs">Content fingerprint: {v.contentHash}</p>
        </AlertDescription>
      </Alert>

      {v.comparisonToBase ? (
        <section className="space-y-3 rounded-xl border border-border bg-white p-5" aria-labelledby="cmp-title">
          <h2 id="cmp-title" className="font-semibold">
            What changes from version {v.comparisonToBase.baseVersionNumber}
          </h2>
          <ComparisonView comparison={v.comparisonToBase} proposedLabel={`Version ${v.number}`} />
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-white p-5" aria-label="Agreement content">
        <PresentedBrief
          sections={v.sections}
          references={v.references.map((r) => ({ id: r.sourceId, label: r.label, note: r.note, url: r.previewUrl, width: r.width, height: r.height }))}
          changedKeys={changed}
        />
      </section>
    </div>
  );
}
