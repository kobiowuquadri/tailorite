"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
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
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { OrderListItem } from "@/components/orders/order-list-item";
import { api } from "@/lib/api";
import { qk, useAiStatus, useSession } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { photos } from "@/assets/images";
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
  const firstName = studio?.ownerName.split(" ")[0];

  if (dashboard.isPending) return <PageSkeleton rows={3} />;
  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;
  const data = dashboard.data;
  const firstRun = data.totals.orders === 0;

  return (
    <div className="space-y-8">
      <WelcomeHero
        studioName={studio?.name}
        title={firstName ? `${greeting(timeZone)}, ${firstName}` : greeting(timeZone)}
        summary={
          firstRun
            ? "Let’s set up your first order."
            : data.attention.length === 0
              ? "Nothing urgent right now. Your orders are on track."
              : `${data.attention.length} ${data.attention.length === 1 ? "order needs" : "orders need"} your attention.`
        }
        totals={data.totals}
      />

      {firstRun ? (
        <FirstRun hasCustomers={data.totals.customers > 0} />
      ) : (
        <>
          <section aria-labelledby="overview" className="space-y-3">
            <h2 id="overview" className="sr-only">
              Overview
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 2xl:gap-4">
              {METRICS.map(({ key, filter, label, icon: Icon, tone }, i) => (
                <Link
                  key={key}
                  href={`/orders?filter=${filter}`}
                  style={{ ["--i" as string]: i + 1 }}
                  className="group animate-fade-up hover-lift rounded-xl border border-border bg-white p-4 hover:border-primary/40"
                >
                  <div className="flex items-start justify-between">
                    <span className={cn("inline-flex size-8 items-center justify-center rounded-lg", tone)}>
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <ArrowUpRight
                      className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular text-foreground">{data.counts[key]}</p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </Link>
              ))}
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <section aria-labelledby="attention" className="animate-fade-up space-y-3" style={{ ["--i" as string]: 4 }}>
              <h2 id="attention" className="text-lg font-semibold">
                Needs your attention
              </h2>
              {data.attention.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
                  Nothing urgent. Orders that need clarification, sharing, a decision on a change, or are due soon appear here.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {data.attention.map((order, i) => (
                    <div key={order.id} className="animate-fade-up" style={{ ["--i" as string]: Math.min(i, 8) + 5 }}>
                      <OrderListItem order={order} timeZone={timeZone} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside className="animate-fade-up space-y-4" style={{ ["--i" as string]: 6 }}>
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

function WelcomeHero({
  studioName,
  title,
  summary,
  totals,
}: {
  studioName?: string;
  title: string;
  summary: string;
  totals: DashboardDto["totals"];
}) {
  return (
    <section className="animate-fade-in relative isolate overflow-hidden rounded-2xl bg-[#0b1b33] text-white">
      <div className="absolute inset-y-0 right-0 -z-10 w-full sm:w-[62%]">
        <Image
          src={photos.designerStudio.src}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 640px) 60vw, 100vw"
          className="animate-drift object-cover object-[35%_45%] brightness-125"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0b1b33] via-[#0b1b33]/80 to-[#0b1b33]/40 sm:bg-gradient-to-r sm:from-[#0b1b33] sm:from-40% sm:via-[#0b1b33]/55 sm:via-62% sm:to-transparent" />
      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10">
        <div className="max-w-xl space-y-2">
          {studioName ? <p className="animate-fade-up text-sm font-medium text-white/75">{studioName}</p> : null}
          <h1 className="animate-fade-up text-2xl font-semibold tracking-tight text-balance sm:text-3xl" style={{ ["--i" as string]: 1 }}>
            {title}
          </h1>
          <p className="animate-fade-up text-sm text-white/85 sm:text-base" style={{ ["--i" as string]: 2 }}>
            {summary}
          </p>
          <p className="animate-fade-up pt-1 text-xs text-white/65 tabular" style={{ ["--i" as string]: 3 }}>
            {totals.orders} {totals.orders === 1 ? "order" : "orders"} · {totals.customers} {totals.customers === 1 ? "customer" : "customers"}
          </p>
        </div>
        <div className="animate-fade-up flex flex-wrap gap-2" style={{ ["--i" as string]: 3 }}>
          <Button asChild size="lg" className="bg-white text-[#0b1b33] hover:bg-white/90">
            <Link href="/orders/new">
              <Plus /> New order
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white">
            <Link href="/customers">
              <Users /> Customers
            </Link>
          </Button>
        </div>
      </div>
    </section>
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
    <section
      className="animate-fade-up grid overflow-hidden rounded-2xl border border-border bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)]"
      style={{ ["--i" as string]: 2 }}
    >
      <div className="p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Create your first order</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every order becomes one shared record of what was agreed — design details, price, deposit and delivery date —
          approved by your customer before the first stitch.
        </p>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="animate-fade-up rounded-xl bg-canvas p-4" style={{ ["--i" as string]: i + 3 }}>
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
      </div>
      <div className="relative hidden min-h-72 lg:block">
        <Image
          src={photos.tailorWorkshop.src}
          alt={photos.tailorWorkshop.alt}
          fill
          placeholder="blur"
          sizes="30vw"
          className="object-cover object-[50%_35%]"
        />
      </div>
    </section>
  );
}
