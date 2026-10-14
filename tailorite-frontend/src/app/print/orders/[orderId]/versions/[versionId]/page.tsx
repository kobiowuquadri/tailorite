"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { PresentedBrief } from "@/components/brief/presented-brief";
import { PrintDocument } from "@/components/print/print-document";
import { shortHash } from "@/components/order/agreement-section";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { VERSION_STATUS_LABELS } from "@/contracts/orders";
import type { VersionDetailDto } from "@/contracts/approvals";

export default function PrintVersionPage() {
  const { orderId, versionId } = useParams<{ orderId: string; versionId: string }>();
  const version = useQuery({
    queryKey: qk.version(orderId, versionId),
    queryFn: () => api<VersionDetailDto>(`/orders/${orderId}/versions/${versionId}`),
  });

  const v = version.data;
  useEffect(() => {
    if (v) document.title = `${v.order.reference} v${v.number} — ${v.customerName}`;
  }, [v]);

  if (version.error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <ErrorState error={version.error} onRetry={() => version.refetch()} />
      </div>
    );
  }
  if (!v) {
    return (
      <div className="mx-auto max-w-[210mm] p-6">
        <PageSkeleton rows={6} />
      </div>
    );
  }

  const approved = v.status === "APPROVED" && v.decision?.decision === "APPROVED";
  const tz = v.studio.timeZone;
  return (
    <PrintDocument
      backHref={`/orders/${orderId}/versions/${versionId}`}
      backLabel="Back to the version"
      studio={v.studio}
      documentTitle={approved ? "Approved tailoring brief" : "Tailoring brief — NOT APPROVED"}
      identifiers={[
        { label: "Order", value: v.order.reference },
        { label: "Version", value: String(v.number) },
        { label: "Customer", value: v.customerName },
        { label: "Ref", value: shortHash(v.contentHash) },
      ]}
      watermark={approved ? undefined : "Not approved"}
      stamp={
        approved ? (
          <div className="flex items-start gap-3 rounded-lg border border-[#b6ebe6] bg-teal-tint p-4 text-sm">
            <BadgeCheck className="mt-0.5 size-5 shrink-0 text-teal-ink" aria-hidden="true" />
            <div>
              <p className="font-semibold text-teal-ink">
                Approved on {formatDateTime(v.decision!.at, tz)}
                {v.isActive ? "" : " — later replaced by an approved change"}
              </p>
              <p>
                Approved through the customer&apos;s private review link by the person who entered the name “{v.decision!.customerName}”. The
                name is self-reported, not a verified signature.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-[#f6c7c2] bg-[#fdecea] p-4 text-sm">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[#b42318]" aria-hidden="true" />
            <div>
              <p className="font-semibold text-[#b42318]">Not approved — {VERSION_STATUS_LABELS[v.status].toLowerCase()}</p>
              <p>This printout is for reference only. It is not an agreement between the studio and the customer.</p>
            </div>
          </div>
        )
      }
      footer={
        <>
          <p>
            {v.order.title} · total {formatMoney(v.totalPriceKobo)} · delivery {formatCalendarDate(v.deliveryDate)}
          </p>
          <p>Content fingerprint (SHA-256): {v.contentHash}</p>
          <p>Printed {formatDateTime(new Date().toISOString(), tz)}</p>
        </>
      }
    >
      {v.change ? (
        <p className="mb-5 rounded-lg bg-canvas p-3 text-sm">
          <span className="font-medium">Change to version {v.change.baseVersionNumber}: </span>
          {v.change.reason ?? "Revised agreement"}. Previous total {formatMoney(v.change.previousTotalKobo)}, previous delivery date{" "}
          {formatCalendarDate(v.change.previousDeliveryDate)}.
        </p>
      ) : null}
      <PresentedBrief
        variant="print"
        sections={v.sections}
        references={v.references.map((r) => ({ id: r.sourceId, label: r.label, note: r.note, url: r.previewUrl, width: r.width, height: r.height }))}
      />
    </PrintDocument>
  );
}
