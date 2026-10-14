"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  BadgeCheck,
  CalendarClock,
  CircleCheckBig,
  Clock,
  GitCompareArrows,
  Hourglass,
  Link2Off,
  Lock,
  MessageSquareText,
  Phone,
  RefreshCw,
  Scissors,
  Undo2,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoMark } from "@/components/brand/logo";
import { PresentedBrief } from "@/components/brief/presented-brief";
import { ComparisonView } from "@/components/order/comparison-view";
import { DecisionSheet, type PortalAction } from "@/components/portal/decision-sheet";
import { ApiError, isApiError } from "@/lib/api";
import { loadReview, portalPost } from "@/lib/portal";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PortalReviewDto, PortalState } from "@/contracts/approvals";

const STATE_META: Record<PortalState, { label: string; icon: LucideIcon; className: string }> = {
  PENDING: { label: "Waiting for your approval", icon: Hourglass, className: "border-[#c9dcff] bg-blue-tint text-blue-ink" },
  APPROVED: { label: "Approved", icon: BadgeCheck, className: "border-[#b6ebe6] bg-teal-tint text-teal-ink" },
  CHANGES_REQUESTED: { label: "Changes requested", icon: MessageSquareText, className: "border-[#ffcfc6] bg-coral-tint text-coral-ink" },
  DECLINED: { label: "Change declined", icon: Ban, className: "border-[#ffcfc6] bg-coral-tint text-coral-ink" },
  SUPERSEDED: { label: "Replaced by a newer version", icon: GitCompareArrows, className: "border-border bg-neutral-tint text-[#3d4757]" },
  WITHDRAWN: { label: "Withdrawn by the studio", icon: Undo2, className: "border-border bg-neutral-tint text-[#3d4757]" },
  ORDER_CANCELLED: { label: "Order cancelled", icon: Ban, className: "border-[#f6c7c2] bg-[#fdecea] text-[#b42318]" },
  VIEW: { label: "Your agreement", icon: BadgeCheck, className: "border-[#b6ebe6] bg-teal-tint text-teal-ink" },
};

const SUCCESS: Record<PortalAction, (r: PortalReviewDto) => string> = {
  APPROVE: (r) => `Thank you. Version ${r.version.number} is approved and recorded. ${r.studio.name} will see your approval in their orders.`,
  REQUEST_CHANGES: (r) => `Your request was sent to ${r.studio.name}. They will prepare an updated version for you to review.`,
  DECLINE: (r) => `You declined the change. Your earlier agreement with ${r.studio.name} stays in force.`,
  CHANGE_REQUEST: (r) => `Your change request was sent to ${r.studio.name}. Nothing changes until you approve a new version.`,
};

function Shell({ children, studioName }: { children: React.ReactNode; studioName?: string }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {studioName ? (
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-tint text-sm font-bold text-blue-ink"
              >
                {studioName.trim().charAt(0).toUpperCase()}
              </span>
            ) : (
              <LogoMark className="size-7" />
            )}
            <span className="truncate font-semibold">{studioName ?? "Tailorite"}</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-tint px-2.5 py-1 text-xs font-medium text-[#3d4757]">
            <Lock className="size-3" aria-hidden="true" /> Private review
          </span>
        </div>
      </header>
      {children}
      <footer className="mx-auto max-w-2xl px-4 pt-2 pb-40 text-center text-xs text-muted-foreground">
        <p className="inline-flex items-center gap-1.5">
          <LogoMark className="size-4" /> Agreement page prepared with Tailorite
        </p>
      </footer>
    </div>
  );
}

function LinkProblem({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : "INTERNAL";
  const copy: Record<string, { title: string; body: string; icon: LucideIcon; retry?: boolean }> = {
    LINK_EXPIRED: { title: "This link has expired", body: "For your security, review links only work for a limited time. Ask the studio to send you a new link.", icon: Clock },
    LINK_REVOKED: { title: "This link no longer works", body: "The studio replaced or turned off this link. Ask them for the latest one.", icon: Link2Off },
    LINK_INVALID: { title: "This link is not valid", body: "Make sure you opened the full link exactly as the studio sent it. If it still fails, ask them to send it again.", icon: Link2Off },
    PORTAL_SESSION_REQUIRED: { title: "Please open your link again", body: "Your review session ended. Open the link from the studio's message again to continue.", icon: Lock },
    RATE_LIMITED: { title: "Too many attempts", body: "Please wait a minute and try again.", icon: Clock, retry: true },
    NETWORK_ERROR: { title: "No connection", body: "We could not reach the review page. Check your internet connection and try again.", icon: RefreshCw, retry: true },
  };
  const c = copy[code] ?? { title: "Something went wrong", body: "Please try again in a moment.", icon: RefreshCw, retry: true };
  return (
    <Shell>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="space-y-4 rounded-2xl border border-border bg-white p-6 text-center" role="alert">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-tint">
            <c.icon className="size-6 text-[#3d4757]" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold">{c.title}</h1>
          <p className="text-muted-foreground">{c.body}</p>
          {c.retry ? (
            <Button variant="outline" size="lg" onClick={onRetry}>
              <RefreshCw /> Try again
            </Button>
          ) : null}
          {error instanceof ApiError && error.requestId ? <p className="text-xs text-muted-foreground">Reference: {error.requestId}</p> : null}
        </div>
      </main>
    </Shell>
  );
}

export function PortalSkeleton() {
  return (
    <Shell>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6" aria-busy="true" aria-label="Loading your review">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </main>
    </Shell>
  );
}

function TermsCard({ review }: { review: PortalReviewDto }) {
  const t = review.terms;
  const balance = t.totalPriceKobo - t.depositRequiredKobo;
  return (
    <section aria-labelledby="terms-title" className="rounded-2xl border border-border bg-white p-5">
      <h2 id="terms-title" className="mb-4 font-semibold">
        Price and dates
      </h2>
      <dl className="grid grid-cols-2 gap-4">
        <div className="col-span-2 rounded-xl bg-canvas p-4">
          <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Wallet className="size-4" aria-hidden="true" /> Total price
          </dt>
          <dd className="mt-1 text-3xl font-bold tracking-tight tabular">{formatMoney(t.totalPriceKobo)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Deposit</dt>
          <dd className="text-lg font-semibold tabular">{formatMoney(t.depositRequiredKobo)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Rest of the price</dt>
          <dd className="text-lg font-semibold tabular">{formatMoney(Math.max(0, balance))}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4" aria-hidden="true" /> Delivery date
          </dt>
          <dd className="text-lg font-semibold">{formatCalendarDate(t.deliveryDate)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Scissors className="size-4" aria-hidden="true" /> Fitting
          </dt>
          {t.fittingDate ? (
            <dd className="text-lg font-semibold">{formatCalendarDate(t.fittingDate)}</dd>
          ) : (
            <dd className="pt-1 text-sm text-muted-foreground">No fitting scheduled</dd>
          )}
        </div>
      </dl>
      {t.paymentNote ? <p className="mt-4 rounded-lg bg-canvas p-3 text-sm">{t.paymentNote}</p> : null}
      <p className="mt-3 text-xs text-muted-foreground">
        The rest of the price is the total minus the deposit, before any payments you have already made. Payments are arranged directly with
        the studio — this page does not take payments.
      </p>
    </section>
  );
}

export function PortalView() {
  const { accessId } = useParams<{ accessId: string }>();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<PortalAction | null>(null);
  const [typedName, setTypedName] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const review = useQuery({
    queryKey: ["portal", accessId],
    queryFn: () => loadReview(accessId),
    retry: (count, error) => isApiError(error, "NETWORK_ERROR") && count < 2,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const { refetch } = review;
  useEffect(() => {
    // Opening the same link again in this tab only changes the fragment (no page load): take the
    // token out of the address bar again and refresh the review.
    const onHashChange = () => {
      if (window.location.hash.length > 1) void refetch();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [refetch]);

  if (review.isPending) return <PortalSkeleton />;
  if (review.error) return <LinkProblem error={review.error} onRetry={() => void review.refetch()} />;
  const r = review.data;
  const meta = STATE_META[r.state];
  const firstName = r.customerName.trim().split(/\s+/)[0];
  const showContent = r.sections.length > 0;
  const showBar = r.permissions.canDecide || r.permissions.canRequestChange;

  async function submit(a: PortalAction, body: unknown, name: string) {
    try {
      const updated = await portalPost(accessId, a === "CHANGE_REQUEST" ? "change-requests" : "decision", body);
      queryClient.setQueryData(["portal", accessId], updated);
      setTypedName(name);
      setAction(null);
      setNotice(null);
      setSuccess(SUCCESS[a](updated));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      if (isApiError(error, "ALREADY_DECIDED") || isApiError(error, "CONFLICT") || isApiError(error, "STALE_VERSION")) {
        // Someone (or another tab) already acted, or the studio changed the version: show the current state.
        setAction(null);
        setNotice(error.message);
        await review.refetch();
        return;
      }
      if (isApiError(error, "LINK_EXPIRED") || isApiError(error, "LINK_REVOKED")) {
        setAction(null);
        await review.refetch();
        return;
      }
      throw error;
    }
  }

  return (
    <Shell studioName={r.studio.name}>
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        {success ? (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-[#b6ebe6] bg-teal-tint p-4 text-teal-ink">
            <CircleCheckBig className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p className="font-medium">{success}</p>
          </div>
        ) : null}
        {notice ? (
          <div role="status" className="rounded-2xl border border-[#f6dfa3] bg-amber-tint p-4 text-sm text-amber-ink">
            {notice}
          </div>
        ) : null}

        <section aria-labelledby="hello" className="space-y-3">
          <h1 id="hello" className="text-2xl font-semibold tracking-tight">
            Hello {firstName},
          </h1>
          <p className="text-[15px] text-[#3d4757]">
            {r.state === "PENDING"
              ? `${r.studio.name} has written down the details of your outfit. Please check everything carefully${
                  r.version.kind === "REVISION" ? ", especially what is changing," : ""
                } before you approve.`
              : `Here are the details of your outfit with ${r.studio.name}.`}
          </p>
          <div className="rounded-2xl border border-border bg-white p-4">
            <p className="text-lg font-semibold">{r.order.title}</p>
            <p className="text-sm text-muted-foreground">
              {r.order.reference} · Version {r.version.number}
              {r.version.kind === "REVISION" ? " (proposed change)" : ""} · prepared {formatDateTime(r.version.publishedAt, r.timeZone)}
            </p>
            <div className={cn("mt-3 flex items-start gap-2.5 rounded-xl border p-3", meta.className)}>
              <meta.icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">{meta.label}</p>
                <p className="text-sm text-foreground">{r.stateMessage}</p>
              </div>
            </div>
            {r.decision ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {r.decision.decision === "APPROVED" ? "Approved" : r.decision.decision === "DECLINED" ? "Declined" : "Changes requested"} as “
                {r.decision.customerName}” on {formatDateTime(r.decision.at, r.timeZone)}.
                {r.decision.comment ? <span className="mt-1 block">Your message: “{r.decision.comment}”</span> : null}
              </p>
            ) : null}
          </div>
        </section>

        {r.openChangeRequest ? (
          <section aria-labelledby="your-request" className="space-y-2 rounded-2xl border border-[#ffcfc6] bg-white p-5">
            <h2 id="your-request" className="font-semibold">
              Your change request
            </h2>
            <ul className="space-y-2">
              {r.openChangeRequest.messages.map((m, i) => (
                <li key={i} className="rounded-lg bg-canvas p-3 text-sm">
                  <p className="whitespace-pre-wrap">“{m.message}”</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.name} · {formatDateTime(m.at, r.timeZone)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              {r.studio.name} will confirm whether this is possible and any change to the price or delivery date. Your current agreement stays
              the same until you approve a new version.
            </p>
          </section>
        ) : null}

        {showContent && r.change ? (
          <section aria-labelledby="what-changes" className="space-y-3 rounded-2xl border-2 border-[#ffcfc6] bg-white p-5">
            <h2 id="what-changes" className="flex items-center gap-2 text-lg font-semibold">
              <GitCompareArrows className="size-5 text-coral-ink" aria-hidden="true" /> What is changing
            </h2>
            <ComparisonView
              comparison={r.change}
              baseLabel={`Before (version ${r.change.previousVersionNumber})`}
              proposedLabel={`Proposed (version ${r.version.number})`}
              compact
            />
          </section>
        ) : null}

        {showContent ? (
          <>
            <TermsCard review={r} />
            <section aria-label="Outfit details" className="rounded-2xl border border-border bg-white p-5">
              <PresentedBrief
                sections={r.sections}
                references={r.references}
                omit={["terms"]}
                changedKeys={r.change ? new Set(r.change.fields.map((f) => f.key)) : undefined}
              />
            </section>
          </>
        ) : null}

        <section aria-labelledby="help" className="space-y-2 rounded-2xl border border-border bg-white p-5 text-sm">
          <h2 id="help" className="font-semibold">
            Questions?
          </h2>
          <p className="text-muted-foreground">
            Contact {r.studio.name}
            {r.studio.city ? ` in ${r.studio.city}` : ""} directly.
          </p>
          {r.studio.phone ? (
            <Button asChild variant="outline">
              <a href={`tel:${r.studio.phone.replace(/[^\d+]/g, "")}`}>
                <Phone /> Call {r.studio.phone}
              </a>
            </Button>
          ) : null}
          <p className="pt-2 text-xs text-muted-foreground">
            This private page shows only what {r.studio.name} chose to share with you. When you approve or send a request, the name you type and
            the time are recorded with this exact version. Link expires {formatDateTime(r.access.expiresAt, r.timeZone)}.
          </p>
        </section>
      </main>

      {showBar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-white/85">
          <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-3">
            {r.permissions.canDecide ? (
              <>
                {/* Phones: the approval is the first, full-width action. Wider screens: side by side. */}
                <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
                  <Button size="lg" className="h-12 text-base sm:order-last" onClick={() => setAction("APPROVE")}>
                    <BadgeCheck /> Approve this version
                  </Button>
                  <Button variant="outline" size="lg" className="h-11 text-base sm:h-12" onClick={() => setAction("REQUEST_CHANGES")}>
                    <MessageSquareText /> Request changes
                  </Button>
                </div>
                {r.permissions.canDecline ? (
                  <button
                    type="button"
                    className="self-center text-sm font-medium text-[#b42318] underline-offset-2 hover:underline"
                    onClick={() => setAction("DECLINE")}
                  >
                    Decline this change and keep my current agreement
                  </button>
                ) : null}
              </>
            ) : (
              <Button variant="outline" size="lg" className="h-12 text-base" onClick={() => setAction("CHANGE_REQUEST")}>
                <MessageSquareText /> Ask for a change
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <DecisionSheet action={action} onClose={() => setAction(null)} review={r} defaultName={typedName} onSubmit={submit} />
    </Shell>
  );
}
