"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  Eye,
  FilePen,
  GitCompareArrows,
  Hourglass,
  Link2,
  Link2Off,
  MessageSquareText,
  Printer,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LinkDialog, type LinkKind } from "@/components/order/link-dialog";
import { ReasonDialog } from "@/components/order/reason-dialog";
import { api, isApiError } from "@/lib/api";
import { invalidateOrder } from "@/lib/queries";
import { toastError } from "@/lib/form-errors";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderDetailDto, VersionSummaryDto } from "@/contracts/orders";
import type { PortalAccessDto } from "@/contracts/approvals";

function Terms({ v }: { v: VersionSummaryDto }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs text-muted-foreground">Total price</dt>
        <dd className="font-semibold tabular">{formatMoney(v.totalPriceKobo)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Deposit required</dt>
        <dd className="font-semibold tabular">{formatMoney(v.depositRequiredKobo)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Delivery date</dt>
        <dd className="font-semibold">{formatCalendarDate(v.deliveryDate)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Fitting</dt>
        <dd className="font-semibold">{v.fittingDate ? formatCalendarDate(v.fittingDate) : "Not scheduled"}</dd>
      </div>
    </dl>
  );
}

/** First 8 characters of the content fingerprint, so a printout can be matched to the record. */
export function shortHash(hash: string) {
  return hash.slice(0, 8).toUpperCase();
}

function linkStatus(link: PortalAccessDto, timeZone: string) {
  if (link.status === "REVOKED") return "Stopped working";
  if (link.status === "EXPIRED") return `Expired ${formatDateTime(link.expiresAt, timeZone)}`;
  return `Works until ${formatDateTime(link.expiresAt, timeZone)}`;
}

export function AgreementSection({
  order,
  links,
  timeZone,
}: {
  order: OrderDetailDto;
  links: PortalAccessDto[] | undefined;
  timeZone: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [linkKind, setLinkKind] = useState<LinkKind | null>(null);
  const [proposing, setProposing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [revoking, setRevoking] = useState<PortalAccessDto | null>(null);
  const active = order.activeVersion;
  const pending = order.pendingVersion;
  const closed = order.productionStatus === "CANCELLED" || Boolean(order.archivedAt);
  const canChange = Boolean(active) && !closed && order.productionStatus !== "COMPLETED";
  const canPropose = canChange && !order.openChangeRequest;
  const unpublishedEdits = order.hasUnpublishedChanges && order.agreementStatus === "APPROVED";
  const pendingLinks = (links ?? []).filter((l) => pending && l.purpose === "APPROVAL" && l.versionNumber === pending.number);
  const pendingHasLiveLink = pendingLinks.some((l) => l.status === "ACTIVE");
  const otherLinks = (links ?? []).filter((l) => !pendingLinks.includes(l));
  const lastDecided = order.versions.find((v) => v.decision && v.decision.decision !== "APPROVED" && !v.isActive);
  const feedbackOpen =
    lastDecided && !pending && (order.agreementStatus === "DRAFT" || order.agreementStatus === "NEEDS_CLARIFICATION" || order.agreementStatus === "READY_FOR_REVIEW");

  async function proposeChange(reason: string) {
    try {
      await api(`/orders/${order.id}/change-requests`, { method: "POST", body: { reason } });
    } catch (error) {
      if (isApiError(error, "CONFLICT")) {
        await invalidateOrder(queryClient, order.id);
        document.getElementById("change")?.scrollIntoView({ behavior: "smooth" });
      }
      throw error;
    }
    await invalidateOrder(queryClient, order.id);
    toast.success(`Change proposal started. Version ${active!.number} stays in force until the customer approves.`);
    router.push(`/orders/${order.id}/brief`);
  }

  async function discardEdits() {
    try {
      await api(`/orders/${order.id}/brief/reset`, { method: "POST" });
      await invalidateOrder(queryClient, order.id);
      toast.success(`Unshared edits discarded. The brief matches version ${active!.number} again.`);
    } catch (error) {
      toastError(error);
    } finally {
      setDiscarding(false);
    }
  }

  async function revoke(link: PortalAccessDto) {
    try {
      await api(`/orders/${order.id}/links/${link.id}/revoke`, { method: "POST" });
      await invalidateOrder(queryClient, order.id);
      toast.success("Link stopped. Anyone holding it can no longer open the brief.");
    } catch (error) {
      toastError(error);
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section id="agreement" aria-labelledby="agreement-title" className="scroll-mt-20 space-y-3">
      <h2 id="agreement-title" className="text-lg font-semibold">
        Agreement
      </h2>

      {!active && !pending ? (
        <div className="rounded-xl border border-dashed border-border bg-white p-5">
          <p className="font-medium">Nothing has been shared with {order.customer.name} yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Build the brief from the customer&apos;s material, confirm the price and dates, then share a version for approval. Nothing is agreed
            until the customer approves it.
          </p>
        </div>
      ) : null}

      {feedbackOpen && lastDecided?.decision ? (
        <Alert className="border-[#ffcfc6] bg-coral-tint/60">
          <MessageSquareText />
          <AlertTitle>
            {lastDecided.decision.decision === "DECLINED"
              ? `${lastDecided.decision.customerName} declined version ${lastDecided.number}`
              : `${lastDecided.decision.customerName} asked for changes to version ${lastDecided.number}`}
          </AlertTitle>
          <AlertDescription>
            {lastDecided.decision.comment ? <p className="whitespace-pre-wrap">“{lastDecided.decision.comment}”</p> : null}
            <p>Update the brief and share a new version when it is ready.</p>
            {!closed ? (
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href={`/orders/${order.id}/brief`}>Update the brief</Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {active ? (
        <article className="rounded-xl border border-[#b6ebe6] bg-white p-5" aria-label={`Approved version ${active.number}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-ink">
                <BadgeCheck className="size-4" aria-hidden="true" /> Version {active.number} approved
                {active.kind === "REVISION" ? " (change)" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {active.decision
                  ? `Approved as “${active.decision.customerName}” on ${formatDateTime(active.decision.at, timeZone)}`
                  : `Published ${formatDateTime(active.publishedAt, timeZone)}`}
                {" · "}
                <span title="Content fingerprint of the approved version">Ref {shortHash(active.contentHash)}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/orders/${order.id}/versions/${active.id}`}>
                  <Eye /> View
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/print/orders/${order.id}/versions/${active.id}`}>
                  <Printer /> Print / PDF
                </Link>
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <Terms v={active} />
          </div>
          {canChange ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="outline" size="sm" onClick={() => setProposing(true)} disabled={!canPropose}>
                <GitCompareArrows /> Propose a change
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLinkKind("change")}>
                <Link2 /> Send a change-request link
              </Button>
              {!canPropose && order.openChangeRequest ? (
                <p className="w-full text-xs text-muted-foreground">A change is already open — see Change below.</p>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : null}

      {unpublishedEdits && active ? (
        <Alert className="border-[#f6dfa3] bg-amber-tint/70">
          <FilePen />
          <AlertTitle>The working brief has edits that are not part of version {active.number}</AlertTitle>
          <AlertDescription>
            These edits were made while the customer was reviewing. They are not agreed. Propose them as a change, or discard them.
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setProposing(true)} disabled={!canPropose}>
                <GitCompareArrows /> Propose these edits as a change
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDiscarding(true)} disabled={closed}>
                <Undo2 /> Discard edits
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {pending ? (
        <article
          className={cn(
            "rounded-xl border bg-white p-5",
            pending.kind === "REVISION" ? "border-[#ffcfc6]" : "border-[#c9dcff]",
          )}
          aria-label={`Version ${pending.number} awaiting approval`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", pending.kind === "REVISION" ? "text-coral-ink" : "text-blue-ink")}>
                <Hourglass className="size-4" aria-hidden="true" /> Version {pending.number} awaiting approval
                {pending.kind === "REVISION" ? " (change)" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                Shared {formatDateTime(pending.publishedAt, timeZone)} · Ref {shortHash(pending.contentHash)}
                {active ? ` · Version ${active.number} stays in force until ${order.customer.name} approves` : " · Not agreed yet"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/orders/${order.id}/versions/${pending.id}`}>
                  <Eye /> What the customer sees
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLinkKind("approval")} disabled={closed}>
                <Link2 /> New link
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <Terms v={pending} />
          </div>
          <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            {links === undefined ? null : pendingLinks.length === 0 ? (
              <p className="text-muted-foreground">No link has been created for this version.</p>
            ) : (
              pendingLinks.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className={cn(l.status === "ACTIVE" ? "text-foreground" : "text-muted-foreground")}>
                    <Link2 className="mr-1.5 inline size-3.5" aria-hidden="true" />
                    Approval link · {linkStatus(l, timeZone)}
                    {l.lastUsedAt ? ` · last opened ${formatDateTime(l.lastUsedAt, timeZone)}` : " · not opened yet"}
                  </span>
                  {l.status === "ACTIVE" ? (
                    <Button variant="ghost" size="sm" onClick={() => setRevoking(l)}>
                      <Link2Off /> Stop link
                    </Button>
                  ) : null}
                </div>
              ))
            )}
            {links !== undefined && !pendingHasLiveLink && !closed ? (
              <p className="text-amber-ink">
                The customer has no working link for this version. Create a new link to send it again.
              </p>
            ) : null}
          </div>
        </article>
      ) : null}

      {otherLinks.length > 0 ? (
        <details className="rounded-xl border border-border bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium">Earlier and change-request links ({otherLinks.length})</summary>
          <ul className="mt-3 space-y-2">
            {otherLinks.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn(l.status === "ACTIVE" ? "text-foreground" : "text-muted-foreground")}>
                  {l.purpose === "APPROVAL" ? `Approval link for version ${l.versionNumber}` : `Change-request link (version ${l.versionNumber})`} ·{" "}
                  {linkStatus(l, timeZone)}
                  {l.lastUsedAt ? ` · last opened ${formatDateTime(l.lastUsedAt, timeZone)}` : ""}
                </span>
                {l.status === "ACTIVE" ? (
                  <Button variant="ghost" size="sm" onClick={() => setRevoking(l)}>
                    <Link2Off /> Stop link
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {linkKind ? (
        <LinkDialog
          kind={linkKind}
          open
          onOpenChange={(o) => !o && setLinkKind(null)}
          orderId={order.id}
          customerName={order.customer.name}
          timeZone={timeZone}
        />
      ) : null}

      <ReasonDialog
        open={proposing}
        onOpenChange={setProposing}
        title={`Propose a change to version ${active?.number ?? ""}`}
        description={
          <>
            You will edit the design, price and dates in the brief, then share the change for approval. Version {active?.number} stays the
            agreement until {order.customer.name} approves the change.
          </>
        }
        label="What is changing and why?"
        hint="The customer sees this reason next to the before-and-after comparison."
        placeholder="e.g. Sleeves changed to elbow length at the customer's request; extra beading on the neckline."
        confirmLabel="Start the change"
        onConfirm={proposeChange}
      />

      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard the unshared edits?</AlertDialogTitle>
            <AlertDialogDescription>
              The working brief goes back to exactly what version {active?.number} says. Approved and shared versions are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep edits</AlertDialogCancel>
            <AlertDialogAction onClick={() => void discardEdits()}>Discard edits</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(revoking)} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop this link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone who has the link will no longer be able to open it. The version itself is not changed
              {revoking?.purpose === "APPROVAL" ? " and stays awaiting approval — you can create a new link at any time." : "."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => revoking && void revoke(revoking)}>Stop link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
