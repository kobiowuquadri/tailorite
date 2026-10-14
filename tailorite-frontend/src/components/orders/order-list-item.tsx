import Link from "next/link";
import { ArrowRight, CalendarClock, FlaskConical, GitPullRequestArrow } from "lucide-react";
import { AgreementBadge, ProductionBadge } from "@/components/status/status-badge";
import { formatCalendarDate, relativeDays } from "@/lib/format";
import type { OrderSummaryDto } from "@/contracts/orders";
import { cn } from "@/lib/utils";

export function orderHref(order: OrderSummaryDto) {
  return ["ADD_SOURCES", "CONTINUE_BRIEF", "RESOLVE_ISSUES", "FINISH_CHANGE"].includes(order.nextStep.kind)
    ? `/orders/${order.id}/brief`
    : `/orders/${order.id}`;
}

export function DueDate({ date, timeZone, className }: { date: string | null; timeZone?: string; className?: string }) {
  if (!date) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const relative = relativeDays(date, timeZone);
  const overdue = relative?.endsWith("ago");
  return (
    <span className={cn("inline-flex items-center gap-1.5", overdue ? "font-medium text-coral-ink" : "text-foreground", className)}>
      <CalendarClock className="size-3.5" aria-hidden="true" />
      {formatCalendarDate(date, "short")}
      {relative ? <span className="text-muted-foreground">· {overdue ? `overdue ${relative.replace(" ago", "")}` : relative}</span> : null}
    </span>
  );
}

/** Card used on the dashboard and for orders on small screens. */
export function OrderListItem({ order, timeZone }: { order: OrderSummaryDto; timeZone?: string }) {
  return (
    <Link
      href={orderHref(order)}
      className="group hover-lift block rounded-xl border border-border bg-white p-4 hover:border-primary/40 hover:bg-[#fbfcff] focus-visible:border-primary"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {order.reference} · {order.customer.name}
            {order.isSynthetic ? (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-ink">
                <FlaskConical className="size-3" aria-hidden="true" /> Synthetic
              </span>
            ) : null}
          </p>
          <p className="truncate font-medium text-foreground">{order.title}</p>
        </div>
        {order.dueDate ? <DueDate date={order.dueDate} timeZone={timeZone} className="text-xs" /> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AgreementBadge status={order.agreementStatus} size="sm" />
        {order.activeVersionNumber && order.productionStatus !== "NOT_STARTED" ? (
          <ProductionBadge status={order.productionStatus} size="sm" />
        ) : order.productionStatus === "CANCELLED" ? (
          <ProductionBadge status="CANCELLED" size="sm" />
        ) : null}
        {order.openChangeRequest ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-coral-ink">
            <GitPullRequestArrow className="size-3.5" aria-hidden="true" /> Change open
          </span>
        ) : null}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary">
        {order.nextStep.label}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </p>
    </Link>
  );
}
