"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Ban, Bot, CircleSlash, GitCompareArrows, Hourglass, MessageSquareText, Store, User, Undo2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/states";
import { shortHash } from "@/components/order/agreement-section";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VERSION_STATUS_LABELS, type OrderDetailDto, type VersionStatus } from "@/contracts/orders";
import type { TimelineEventDto } from "@/contracts/timeline";

const VERSION_META: Record<VersionStatus, { icon: LucideIcon; className: string }> = {
  AWAITING_APPROVAL: { icon: Hourglass, className: "text-blue-ink" },
  APPROVED: { icon: BadgeCheck, className: "text-teal-ink" },
  CHANGES_REQUESTED: { icon: MessageSquareText, className: "text-coral-ink" },
  DECLINED: { icon: Ban, className: "text-[#b42318]" },
  SUPERSEDED: { icon: GitCompareArrows, className: "text-muted-foreground" },
  WITHDRAWN: { icon: Undo2, className: "text-muted-foreground" },
};

/** Every shared version with its customer decision; nothing is ever deleted or edited. */
export function VersionHistory({ order, timeZone }: { order: OrderDetailDto; timeZone: string }) {
  if (order.versions.length === 0) return null;
  return (
    <section aria-labelledby="versions-title" className="space-y-3">
      <h2 id="versions-title" className="text-lg font-semibold">
        Versions
      </h2>
      <ol className="divide-y divide-border rounded-xl border border-border bg-white">
        {order.versions.map((v) => {
          const meta = VERSION_META[v.status];
          const label = v.isActive ? "Approved — in force" : v.status === "APPROVED" ? "Approved, later replaced" : VERSION_STATUS_LABELS[v.status];
          return (
            <li key={v.id}>
              <Link href={`/orders/${order.id}/versions/${v.id}`} className="block space-y-1 p-4 hover:bg-canvas focus-visible:bg-canvas">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    Version {v.number}
                    {v.kind === "REVISION" ? <span className="font-normal text-muted-foreground"> · change to version {v.basedOnVersionNumber}</span> : null}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 text-xs font-medium", meta.className)}>
                    <meta.icon className="size-3.5" aria-hidden="true" /> {label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(v.totalPriceKobo)} · delivery {formatCalendarDate(v.deliveryDate, "short")} · shared{" "}
                  {formatDateTime(v.publishedAt, timeZone)} · Ref {shortHash(v.contentHash)}
                </p>
                {v.decision ? (
                  <p className="text-sm">
                    {v.decision.decision === "APPROVED" ? "Approved" : v.decision.decision === "DECLINED" ? "Declined" : "Changes requested"} as
                    “{v.decision.customerName}” · {formatDateTime(v.decision.at, timeZone)}
                    {v.decision.comment ? <span className="block text-muted-foreground">“{v.decision.comment}”</span> : null}
                  </p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground">
        Names are typed by the customer on the review page; link possession is how they are identified. Tailorite does not verify identity.
      </p>
    </section>
  );
}

const ACTOR_ICON: Record<TimelineEventDto["actorType"], LucideIcon> = { USER: Store, CUSTOMER: User, SYSTEM: Bot };

export function Timeline({ orderId, timeZone }: { orderId: string; timeZone: string }) {
  const timeline = useQuery({ queryKey: qk.timeline(orderId), queryFn: () => api<TimelineEventDto[]>(`/orders/${orderId}/timeline`) });
  return (
    <section aria-labelledby="timeline-title" className="space-y-3">
      <h2 id="timeline-title" className="text-lg font-semibold">
        History
      </h2>
      {timeline.error ? (
        <ErrorState error={timeline.error} onRetry={() => timeline.refetch()} />
      ) : !timeline.data ? (
        <Skeleton className="h-40 w-full" />
      ) : timeline.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
      ) : (
        <ol className="relative space-y-4 rounded-xl border border-border bg-white p-4">
          {timeline.data.map((e) => {
            const Icon = e.type.includes("CANCEL") ? CircleSlash : ACTOR_ICON[e.actorType];
            return (
              <li key={e.id} className="flex gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                    e.actorType === "CUSTOMER" ? "bg-coral-tint text-coral-ink" : e.actorType === "SYSTEM" ? "bg-neutral-tint text-muted-foreground" : "bg-blue-tint text-blue-ink",
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="break-words">{e.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.actorLabel ?? (e.actorType === "SYSTEM" ? "Tailorite" : e.actorType === "CUSTOMER" ? "Customer" : "Studio")} ·{" "}
                    <time dateTime={e.createdAt}>{formatDateTime(e.createdAt, timeZone)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
