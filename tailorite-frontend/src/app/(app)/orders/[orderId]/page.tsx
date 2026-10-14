"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileStack, FlaskConical, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { AgreementBadge, ProductionBadge } from "@/components/status/status-badge";
import { AgreementSection } from "@/components/order/agreement-section";
import { ChangeSection } from "@/components/order/change-section";
import { PaymentsSection } from "@/components/order/payments-section";
import { ProductionSection } from "@/components/order/production-section";
import { Timeline, VersionHistory } from "@/components/order/history";
import { api, isApiError } from "@/lib/api";
import { qk, useSession } from "@/lib/queries";
import { formatDateShort } from "@/lib/format";
import type { NextStep, OrderDetailDto } from "@/contracts/orders";
import type { PortalAccessDto } from "@/contracts/approvals";

const BRIEF_STEPS: NextStep["kind"][] = ["ADD_SOURCES", "CONTINUE_BRIEF", "RESOLVE_ISSUES", "SHARE_FOR_REVIEW", "FINISH_CHANGE"];
const WAITING: OrderDetailDto["agreementStatus"][] = ["AWAITING_APPROVAL", "REVISION_AWAITING_APPROVAL"];

function PrimaryAction({ order }: { order: OrderDetailDto }) {
  const step = order.nextStep;
  if (BRIEF_STEPS.includes(step.kind)) {
    return (
      <Button asChild size="lg">
        <Link href={`/orders/${order.id}/brief`}>
          <PencilLine /> {step.kind === "SHARE_FOR_REVIEW" ? "Review and share" : step.kind === "FINISH_CHANGE" ? "Continue the change" : "Continue draft"}
        </Link>
      </Button>
    );
  }
  if (step.kind === "REVIEW_CHANGE_REQUEST") {
    return (
      <Button asChild size="lg">
        <a href="#change">
          Review the change request <ArrowRight />
        </a>
      </Button>
    );
  }
  return (
    <Button asChild variant="outline">
      <Link href={`/orders/${order.id}/brief`}>
        <FileStack /> {order.activeVersion ? "Brief and sources" : "Open brief"}
      </Link>
    </Button>
  );
}

export default function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const queryClient = useQueryClient();
  const session = useSession();
  const timeZone = session.data?.studio?.timeZone ?? "Africa/Lagos";
  const order = useQuery({
    queryKey: qk.order(orderId),
    queryFn: () => api<OrderDetailDto>(`/orders/${orderId}`),
    // While the customer is deciding, check for their answer periodically.
    refetchInterval: (q) => (q.state.data && WAITING.includes(q.state.data.agreementStatus) ? 15_000 : false),
  });
  const links = useQuery({ queryKey: qk.links(orderId), queryFn: () => api<PortalAccessDto[]>(`/orders/${orderId}/links`) });

  // When the agreement state changes (e.g. the customer approved), refresh everything derived from it.
  const signature = order.data
    ? [order.data.agreementStatus, order.data.productionStatus, order.data.activeVersionNumber, order.data.pendingVersionNumber, order.data.openChangeRequest].join("|")
    : null;
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (signature && previous.current && previous.current !== signature) {
      for (const queryKey of [qk.finance(orderId), qk.timeline(orderId), qk.links(orderId), qk.changes(orderId), qk.compare(orderId), qk.dashboard]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    }
    previous.current = signature;
  }, [signature, orderId, queryClient]);

  if (order.isPending) return <PageSkeleton rows={5} />;
  if (order.error) {
    return isApiError(order.error, "NOT_FOUND") ? (
      <ErrorState error={order.error} title="Order not found" />
    ) : (
      <ErrorState error={order.error} onRetry={() => order.refetch()} />
    );
  }
  const o = order.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-1.5">
            <Link href="/orders" className="hover:text-primary">
              Orders
            </Link>
            <span aria-hidden="true">/</span>
            <span>{o.reference}</span>
          </span>
        }
        title={o.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/customers/${o.customer.id}`} className="font-medium text-foreground hover:text-primary">
              {o.customer.name}
            </Link>
            <span aria-hidden="true">·</span>
            <span>{o.garmentType}</span>
            <span aria-hidden="true">·</span>
            <span>Created {formatDateShort(o.createdAt, timeZone)}</span>
            {o.isSynthetic ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-tint px-2 py-0.5 text-xs font-medium text-amber-ink">
                <FlaskConical className="size-3" aria-hidden="true" /> Synthetic demo order
              </span>
            ) : null}
          </span>
        }
        actions={<PrimaryAction order={o} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <AgreementBadge status={o.agreementStatus} />
        <ProductionBadge status={o.productionStatus} />
        {o.archivedAt ? <span className="text-xs font-medium text-muted-foreground">Archived {formatDateShort(o.archivedAt, timeZone)}</span> : null}
        {o.nextStep.kind !== "NONE" ? (
          <span className="text-sm text-muted-foreground">
            Next: <span className="font-medium text-foreground">{o.nextStep.label}</span>
          </span>
        ) : null}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <AgreementSection order={o} links={links.data} timeZone={timeZone} />
          <ChangeSection order={o} timeZone={timeZone} />
          <PaymentsSection order={o} timeZone={timeZone} />
        </div>
        <div className="min-w-0 space-y-6">
          <ProductionSection order={o} timeZone={timeZone} />
          <section aria-labelledby="material-title" className="space-y-3">
            <h2 id="material-title" className="text-lg font-semibold">
              Customer material
            </h2>
            <div className="space-y-3 rounded-xl border border-border bg-white p-5 text-sm">
              <p>
                {o.sourceCount === 0
                  ? "No messages, images or voice notes added yet."
                  : `${o.sourceCount} source${o.sourceCount === 1 ? "" : "s"} (messages, images, voice notes) linked to this brief.`}
                {o.openIssueCount > 0 ? ` ${o.openIssueCount} open question${o.openIssueCount === 1 ? "" : "s"}.` : ""}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/orders/${o.id}/brief`}>
                  <FileStack /> Open sources and brief
                </Link>
              </Button>
            </div>
          </section>
          <VersionHistory order={o} timeZone={timeZone} />
          <Timeline orderId={o.id} timeZone={timeZone} />
        </div>
      </div>
    </div>
  );
}
