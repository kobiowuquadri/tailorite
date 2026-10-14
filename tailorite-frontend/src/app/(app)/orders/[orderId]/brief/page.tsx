"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { Workbench } from "@/components/workbench/workbench";
import { api } from "@/lib/api";
import { qk, useSession } from "@/lib/queries";
import type { BriefDto } from "@/contracts/brief";
import type { SourcesDto } from "@/contracts/sources";
import type { OrderDetailDto } from "@/contracts/orders";

export default function BriefWorkbenchPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const session = useSession();
  const brief = useQuery({ queryKey: qk.brief(orderId), queryFn: () => api<BriefDto>(`/orders/${orderId}/brief`) });
  const sources = useQuery({ queryKey: qk.sources(orderId), queryFn: () => api<SourcesDto>(`/orders/${orderId}/sources`) });
  const order = useQuery({ queryKey: qk.order(orderId), queryFn: () => api<OrderDetailDto>(`/orders/${orderId}`) });

  const error = brief.error ?? sources.error ?? order.error;
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void brief.refetch();
          void sources.refetch();
          void order.refetch();
        }}
      />
    );
  }
  if (!brief.data || !sources.data || !order.data) return <PageSkeleton rows={5} />;
  return (
    <Workbench
      key={orderId}
      orderId={orderId}
      initialBrief={brief.data}
      sources={sources.data}
      order={order.data}
      timeZone={session.data?.studio?.timeZone ?? "Africa/Lagos"}
    />
  );
}
