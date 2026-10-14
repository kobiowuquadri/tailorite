"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitCompareArrows, Hourglass, MessageSquareText, PencilRuler, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ComparisonView } from "@/components/order/comparison-view";
import { ReasonDialog } from "@/components/order/reason-dialog";
import { ErrorState } from "@/components/common/states";
import { api } from "@/lib/api";
import { invalidateOrder, qk } from "@/lib/queries";
import { formatDateTime, formatKobo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHANGE_STATUS_LABELS, OPEN_CHANGE_STATUSES, type ChangeRequestDto } from "@/contracts/changes";
import type { OrderDetailDto } from "@/contracts/orders";
import type { VersionComparisonDto, VersionDetailDto } from "@/contracts/approvals";

function Messages({ cr, timeZone }: { cr: ChangeRequestDto; timeZone: string }) {
  if (cr.customerMessages.length === 0) return null;
  return (
    <ul className="space-y-2">
      {cr.customerMessages.map((m, i) => (
        <li key={i} className="rounded-lg bg-canvas p-3 text-sm">
          <p className="whitespace-pre-wrap">“{m.message}”</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.name} (name typed by the customer) · {formatDateTime(m.at, timeZone)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Live comparison of the change being prepared (working brief) against the approved version. */
function DraftComparison({ orderId }: { orderId: string }) {
  const compare = useQuery({ queryKey: qk.compare(orderId), queryFn: () => api<VersionComparisonDto>(`/orders/${orderId}/compare`) });
  if (compare.error) return <ErrorState error={compare.error} onRetry={() => compare.refetch()} />;
  if (!compare.data) return <Skeleton className="h-40 w-full" />;
  return <ComparisonView comparison={compare.data} proposedLabel="Proposed (not shared yet)" />;
}

/** Comparison frozen in the version that was shared for approval. */
function PendingComparison({ orderId, versionId }: { orderId: string; versionId: string }) {
  const version = useQuery({
    queryKey: qk.version(orderId, versionId),
    queryFn: () => api<VersionDetailDto>(`/orders/${orderId}/versions/${versionId}`),
  });
  if (version.error) return <ErrorState error={version.error} onRetry={() => version.refetch()} />;
  if (!version.data) return <Skeleton className="h-40 w-full" />;
  if (!version.data.comparisonToBase) return null;
  return <ComparisonView comparison={version.data.comparisonToBase} proposedLabel={`Version ${version.data.number} (proposed)`} />;
}

export function ChangeSection({ order, timeZone }: { order: OrderDetailDto; timeZone: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const changes = useQuery({
    queryKey: qk.changes(order.id),
    queryFn: () => api<ChangeRequestDto[]>(`/orders/${order.id}/change-requests`),
  });
  const [starting, setStarting] = useState<ChangeRequestDto | null>(null);
  const [declining, setDeclining] = useState<ChangeRequestDto | null>(null);

  if (changes.error) return <ErrorState error={changes.error} onRetry={() => changes.refetch()} title="We could not load change requests" />;
  if (!changes.data) return null;
  if (changes.data.length === 0) return null;

  const open = changes.data.find((c) => OPEN_CHANGE_STATUSES.includes(c.status)) ?? null;
  const history = changes.data.filter((c) => c !== open);
  const pending = order.pendingVersion?.kind === "REVISION" ? order.pendingVersion : null;

  async function start(cr: ChangeRequestDto, reason: string) {
    await api(`/orders/${order.id}/change-requests/${cr.id}/start`, { method: "POST", body: { reason } });
    await invalidateOrder(queryClient, order.id);
    toast.success("Proposal started. Update the brief, then share the change for approval.");
    router.push(`/orders/${order.id}/brief`);
  }

  async function decline(cr: ChangeRequestDto, note: string) {
    await api(`/orders/${order.id}/change-requests/${cr.id}/decline`, { method: "POST", body: { note } });
    await invalidateOrder(queryClient, order.id);
    toast.success(
      cr.initiator === "CUSTOMER" && cr.status === "REQUESTED"
        ? `Request declined. Version ${cr.baseVersionNumber} remains the agreement.`
        : `Change withdrawn. Version ${cr.baseVersionNumber} remains the agreement.`,
    );
  }

  return (
    <section id="change" aria-labelledby="change-title" className="scroll-mt-20 space-y-3">
      <h2 id="change-title" className="text-lg font-semibold">
        Changes
      </h2>

      {open ? (
        <article
          className={cn(
            "space-y-4 rounded-xl border bg-white p-5",
            open.status === "AWAITING_APPROVAL" ? "border-[#ffcfc6]" : "border-[#f6dfa3]",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p
                className={cn(
                  "inline-flex items-center gap-1.5 text-sm font-semibold",
                  open.status === "AWAITING_APPROVAL" ? "text-coral-ink" : "text-amber-ink",
                )}
              >
                {open.status === "REQUESTED" ? (
                  <MessageSquareText className="size-4" aria-hidden="true" />
                ) : open.status === "DRAFTING" ? (
                  <PencilRuler className="size-4" aria-hidden="true" />
                ) : (
                  <Hourglass className="size-4" aria-hidden="true" />
                )}
                {open.status === "REQUESTED"
                  ? "The customer asked for a change"
                  : open.status === "DRAFTING"
                    ? "Change proposal being prepared"
                    : `Change awaiting approval${open.proposedVersionNumber ? ` — version ${open.proposedVersionNumber}` : ""}`}
              </p>
              <p className="text-sm text-muted-foreground">
                {open.initiator === "CUSTOMER" ? "Requested by the customer" : "Started by the studio"} on{" "}
                {formatDateTime(open.createdAt, timeZone)} · based on approved version {open.baseVersionNumber}, which stays in force until a
                change is approved.
              </p>
            </div>
          </div>

          <Messages cr={open} timeZone={timeZone} />
          {open.reason && open.status === "DRAFTING" ? (
            <p className="text-sm">
              <span className="font-medium">Reason shown to the customer: </span>
              {open.reason}
            </p>
          ) : null}

          {open.status === "REQUESTED" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Only you can confirm whether this change is possible, and what it does to the price and delivery date. Prepare a proposal
                and the customer will approve or decline it — or decline the request with an explanation.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setStarting(open)}>
                  <PencilRuler /> Prepare a proposal
                </Button>
                <Button variant="outline" onClick={() => setDeclining(open)}>
                  <X /> Decline request
                </Button>
              </div>
            </div>
          ) : null}

          {open.status === "DRAFTING" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/orders/${order.id}/brief`}>
                    <PencilRuler /> Continue the proposal
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => setDeclining(open)}>
                  <Undo2 /> {open.initiator === "CUSTOMER" ? "Decline the request" : "Withdraw the proposal"}
                </Button>
              </div>
              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  <GitCompareArrows className="mr-1.5 inline size-4" aria-hidden="true" /> Compare with version {open.baseVersionNumber}
                </summary>
                <div className="mt-3">
                  <DraftComparison orderId={order.id} />
                </div>
              </details>
            </div>
          ) : null}

          {open.status === "AWAITING_APPROVAL" && pending ? (
            <div className="space-y-3">
              <PendingComparison orderId={order.id} versionId={pending.id} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setDeclining(open)}>
                  <Undo2 /> Withdraw the change
                </Button>
              </div>
            </div>
          ) : null}
        </article>
      ) : null}

      {history.length > 0 ? (
        <details className="rounded-xl border border-border bg-white p-4" open={!open}>
          <summary className="cursor-pointer text-sm font-medium">Change history ({history.length})</summary>
          <ul className="mt-3 divide-y divide-border">
            {history.map((c) => (
              <li key={c.id} className="space-y-1 py-3 text-sm first:pt-0 last:pb-0">
                <p className="font-medium">
                  {CHANGE_STATUS_LABELS[c.status]}
                  {c.proposedVersionNumber ? ` · version ${c.proposedVersionNumber}` : ""}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {c.initiator === "CUSTOMER" ? "customer request" : "studio proposal"} from version {c.baseVersionNumber}
                  </span>
                </p>
                {c.reason ? <p className="text-muted-foreground">Reason: {c.reason}</p> : null}
                {c.customerMessages.length > 0 ? (
                  <p className="text-muted-foreground">Customer: “{c.customerMessages[c.customerMessages.length - 1].message}”</p>
                ) : null}
                {c.priceAdjustmentKobo !== null && c.status === "APPROVED" ? (
                  <p className="text-muted-foreground">
                    Price {c.priceAdjustmentKobo >= 0 ? "increase" : "decrease"}: {formatKobo(Math.abs(c.priceAdjustmentKobo))}
                  </p>
                ) : null}
                {c.decisionNote ? <p className="text-muted-foreground">Note: {c.decisionNote}</p> : null}
                <p className="text-xs text-muted-foreground">
                  Opened {formatDateTime(c.createdAt, timeZone)}
                  {c.closedAt ? ` · closed ${formatDateTime(c.closedAt, timeZone)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ReasonDialog
        open={Boolean(starting)}
        onOpenChange={(o) => !o && setStarting(null)}
        title="Prepare a change proposal"
        description="You will update the brief with the new design, price and delivery date, then share it. The customer approves or declines the final proposal."
        label="Summary of the change for the customer"
        hint="Shown to the customer next to the before-and-after comparison."
        defaultValue={starting?.customerMessages.at(-1)?.message.slice(0, 1000) ?? ""}
        confirmLabel="Start the proposal"
        onConfirm={(reason) => start(starting!, reason)}
      />

      <ReasonDialog
        open={Boolean(declining)}
        onOpenChange={(o) => !o && setDeclining(null)}
        title={
          declining?.status === "REQUESTED"
            ? "Decline the customer's request"
            : declining?.initiator === "CUSTOMER"
              ? "Decline the request and discard the proposal"
              : "Withdraw the change proposal"
        }
        description={
          <>
            Version {declining?.baseVersionNumber} stays the agreement.
            {declining?.status === "AWAITING_APPROVAL" ? " The customer's link to the proposal stops working." : ""}
            {declining?.status !== "REQUESTED" ? " The working brief goes back to the approved version." : ""}
          </>
        }
        label={declining?.initiator === "CUSTOMER" ? "Reason for declining" : "Why are you withdrawing it?"}
        hint="Kept in the order history. Tailorite does not message the customer — tell them yourself."
        confirmLabel={declining?.status === "REQUESTED" ? "Decline request" : declining?.initiator === "CUSTOMER" ? "Decline" : "Withdraw"}
        destructive
        onConfirm={(note) => decline(declining!, note)}
      />
    </section>
  );
}
