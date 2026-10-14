"use client";

import { useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { PresentedBrief } from "@/components/brief/presented-brief";
import { PrintDocument } from "@/components/print/print-document";
import { api } from "@/lib/api";
import { qk, useSession } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { presentBrief, type BriefDto } from "@/contracts/brief";
import type { OrderDetailDto } from "@/contracts/orders";
import type { SourcesDto } from "@/contracts/sources";

/** Working-brief printout for the workshop. Always marked as a draft: it is never an agreement. */
export default function PrintDraftPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const session = useSession();
  const brief = useQuery({ queryKey: qk.brief(orderId), queryFn: () => api<BriefDto>(`/orders/${orderId}/brief`) });
  const order = useQuery({ queryKey: qk.order(orderId), queryFn: () => api<OrderDetailDto>(`/orders/${orderId}`) });
  const sources = useQuery({ queryKey: qk.sources(orderId), queryFn: () => api<SourcesDto>(`/orders/${orderId}/sources`) });
  const sections = useMemo(() => (brief.data ? presentBrief(brief.data.content) : []), [brief.data]);

  useEffect(() => {
    if (order.data) document.title = `${order.data.reference} draft — ${order.data.customer.name}`;
  }, [order.data]);

  const error = brief.error ?? order.error ?? sources.error;
  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <ErrorState error={error} />
      </div>
    );
  }
  const studio = session.data?.studio;
  if (!brief.data || !order.data || !sources.data || !studio) {
    return (
      <div className="mx-auto max-w-[210mm] p-6">
        <PageSkeleton rows={6} />
      </div>
    );
  }
  const byId = new Map(sources.data.sources.map((s) => [s.id, s]));
  const references = brief.data.content.references.flatMap((r) => {
    const s = byId.get(r.sourceId);
    return s?.previewUrl ? [{ id: s.id, label: s.label, note: r.note, url: s.previewUrl, width: s.width, height: s.height }] : [];
  });

  return (
    <PrintDocument
      backHref={`/orders/${orderId}/brief`}
      backLabel="Back to the brief"
      studio={studio}
      documentTitle="DRAFT — not approved"
      identifiers={[
        { label: "Order", value: order.data.reference },
        { label: "Customer", value: order.data.customer.name },
        { label: "Draft revision", value: String(brief.data.revision) },
      ]}
      watermark="Draft"
      stamp={
        <div className="flex items-start gap-3 rounded-lg border border-[#f6c7c2] bg-[#fdecea] p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[#b42318]" aria-hidden="true" />
          <div>
            <p className="font-semibold text-[#b42318]">DRAFT — not approved by the customer</p>
            <p>
              Working copy for the studio. It may change and is not an agreement.
              {order.data.activeVersion ? ` The agreement in force is approved version ${order.data.activeVersion.number}.` : ""}
            </p>
          </div>
        </div>
      }
      footer={<p>Printed {formatDateTime(new Date().toISOString(), studio.timeZone)} · draft last saved {formatDateTime(brief.data.updatedAt, studio.timeZone)}</p>}
    >
      <PresentedBrief variant="print" sections={sections} references={references} />
    </PrintDocument>
  );
}
