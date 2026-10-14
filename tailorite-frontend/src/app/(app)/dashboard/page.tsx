"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  CalendarClock,
  CircleHelp,
  FilePen,
  GitPullRequestArrow,
  Hourglass,
  MessageSquareText,
  Plus,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, ErrorState, PageSkeleton } from "@/components/common/states";
import { OrderListItem } from "@/components/orders/order-list-item";
import { api } from "@/lib/api";
import { qk, useAiStatus, useSession } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { DashboardDto, OrderFilter } from "@/contracts/orders";

type Metric = { key: keyof DashboardDto["counts"]; filter: OrderFilter; label: string; icon: LucideIcon; tone: string };

const METRICS: Metric[] = [
  { key: "draft", filter: "drafts", label: "Draft orders", icon: FilePen, tone: "text-[#3d4757] bg-neutral-tint" },
  { key: "needsClarification", filter: "needs_clarification", label: "Needs clarification", icon: CircleHelp, tone: "text-amber-ink bg-amber-tint" },
  { key: "awaitingApproval", filter: "awaiting_approval", label: "Awaiting customer approval", icon: Hourglass, tone: "text-blue-ink bg-blue-tint" },
  { key: "approvedNotStarted", filter: "approved_not_started", label: "Approved, not started", icon: BadgeCheck, tone: "text-teal-ink bg-teal-tint" },
  { key: "dueSoon", filter: "due_soon", label: "Due within 7 days", icon: CalendarClock, tone: "text-coral-ink bg-coral-tint" },
  { key: "changeRequested", filter: "change_requested", label: "Change requested", icon: GitPullRequestArrow, tone: "text-coral-ink bg-coral-tint" },
];

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const session = useSession();
  const ai = useAiStatus();
  const dashboard = useQuery({ queryKey: qk.dashboard, queryFn: () => api<DashboardDto>("/dashboard") });
  const studio = session.data?.studio;
  const timeZone = studio?.timeZone ?? "Africa/Lagos";

  if (dashboard.isPending) return <PageSkeleton rows={3} />;
  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;
  const data = dashboard.data;
  const firstRun = data.totals.orders === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={studio?.name}
        title={`${greeting(timeZone)}, ${studio?.ownerName.split(" ")[0] ?? ""}`.trim()}
        description="Here is what needs attention across your orders."
        actions={
          <Button asChild>
            <Link href="/orders/new">
              <Plus /> New order
            </Link>
          </Button>
        }
      />

      {firstRun ? (
        <FirstRun hasCustomers={data.totals.customers > 0} />
      ) : (
        <>
          <section aria-labelledby="overview" className="space-y-3">
            <h2 id="overview" className="sr-only">
              Overview
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {METRICS.map(({ key, filter, label, icon: Icon, tone }) => (
                <Link
                  key={key}
                  href={`/orders?filter=${filter}`}
                  className="rounded-xl border border-border bg-white p-4 transition-colors hover:border-primary/40"
                >
                  <span className={cn("inline-flex size-8 items-center justify-center rounded-lg", tone)}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-2xl font-semibold tabular text-foreground">{data.counts[key]}</p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </Link>
              ))}
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <section aria-labelledby="attention" className="space-y-3">
              <h2 id="attention" className="text-lg font-semibold">
                Needs your attention
              </h2>
              {data.attention.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
                  Nothing urgent. Orders that need clarification, sharing, a decision on a change, or are due soon appear here.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.attention.map((order) => (
                    <OrderListItem key={order.id} order={order} timeZone={timeZone} />
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <div className="rounded-xl border border-border bg-white p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Sparkles className="size-4 text-primary" aria-hidden="true" /> AI extraction
                </div>
                {ai.data ? (
                  <>
                    <p className="mt-2 text-sm font-medium">{ai.data.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{ai.data.message}</p>
                    {ai.data.available ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {ai.data.limits.usedToday} of {ai.data.limits.jobsPerDay} processing runs used today
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Checking availability…</p>
                )}
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <h2 className="font-medium">Recently updated</h2>
                <ul className="mt-3 divide-y divide-border">
                  {data.recent.map((o) => (
                    <li key={o.id}>
                      <Link href={`/orders/${o.id}`} className="block py-2 text-sm hover:text-primary">
                        <span className="font-medium">{o.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {o.reference} · {o.customer.name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function FirstRun({ hasCustomers }: { hasCustomers: boolean }) {
  const steps = [
    { icon: UserPlus, title: "Add a customer", body: "Name and phone number are enough to start." },
    {
      icon: MessageSquareText,
      title: "Collect their instructions",
      body: "Paste messages, upload reference pictures and voice notes, or record one in the browser.",
    },
    {
      icon: BadgeCheck,
      title: "Agree the exact brief",
      body: "Resolve questions, confirm price and delivery date, and send a link the customer approves on their phone.",
    },
  ];
  return (
    <section className="rounded-2xl border border-border bg-white p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Create your first order</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Every order becomes one shared record of what was agreed — design details, price, deposit and delivery date —
        approved by your customer before the first stitch.
      </p>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="rounded-xl bg-canvas p-4">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-blue-tint text-blue-ink">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <p className="mt-3 font-medium">
              {i + 1}. {title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/orders/new">
            <Plus /> Create your first order
          </Link>
        </Button>
        {!hasCustomers ? (
          <Button asChild size="lg" variant="outline">
            <Link href="/customers/new">
              <UserPlus /> Add a customer
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
