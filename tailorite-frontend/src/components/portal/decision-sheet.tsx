"use client";

import { useState } from "react";
import { BadgeCheck, MessageSquareText, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api";
import { formatCalendarDate, formatKobo } from "@/lib/format";
import { PortalChangeRequestInput, PortalDecisionInput, type PortalReviewDto } from "@/contracts/approvals";

export type PortalAction = "APPROVE" | "REQUEST_CHANGES" | "DECLINE" | "CHANGE_REQUEST";

const TITLES: Record<PortalAction, string> = {
  APPROVE: "Approve this version",
  REQUEST_CHANGES: "Request changes",
  DECLINE: "Decline this change",
  CHANGE_REQUEST: "Ask for a change",
};

type Errors = Partial<Record<"name" | "comment" | "confirmed" | "form", string>>;

function firstIssues(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    const mapped = key === "message" ? "comment" : key;
    if (mapped === "name" || mapped === "comment" || mapped === "confirmed") out[mapped] ??= issue.message;
    else out.form ??= issue.message;
  }
  return out;
}

/**
 * Bottom sheet for every customer action. Approvals need a typed name and an explicit
 * confirmation; the name is self-reported, never presented as a verified identity.
 */
export function DecisionSheet({
  action,
  onClose,
  review,
  defaultName,
  onSubmit,
}: {
  action: PortalAction | null;
  onClose: () => void;
  review: PortalReviewDto;
  defaultName: string;
  onSubmit: (action: PortalAction, body: unknown, name: string) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [comment, setComment] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<PortalAction | null>(action);
  if (action !== current) {
    // A fresh form for every opening (the typed name is kept for convenience).
    setCurrent(action);
    if (action) {
      setName(defaultName);
      setComment("");
      setConfirmed(false);
      setErrors({});
    }
  }

  async function submit() {
    if (!action) return;
    const parsed =
      action === "CHANGE_REQUEST"
        ? PortalChangeRequestInput.safeParse({ name, message: comment })
        : PortalDecisionInput.safeParse(
            action === "APPROVE"
              ? { decision: "APPROVE", name, confirmed, contentHash: review.version.contentHash }
              : action === "REQUEST_CHANGES"
                ? { decision: "REQUEST_CHANGES", name, comment, contentHash: review.version.contentHash }
                : { decision: "DECLINE", name, comment: comment.trim() || undefined, contentHash: review.version.contentHash },
          );
    if (!parsed.success) {
      setErrors(firstIssues(parsed.error.issues));
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await onSubmit(action, parsed.data, name.trim());
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        setErrors(
          firstIssues(Object.entries(error.fieldErrors).map(([path, messages]) => ({ path: [path], message: messages[0] ?? "Check this field" }))),
        );
      } else {
        setErrors({ form: error instanceof Error ? error.message : "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  const isRevision = review.version.kind === "REVISION";
  const commentLabel =
    action === "REQUEST_CHANGES"
      ? "What would you like changed?"
      : action === "CHANGE_REQUEST"
        ? "What would you like to change?"
        : "Anything you want the studio to know? (optional)";

  return (
    <Sheet open={action !== null} onOpenChange={(o) => !o && !busy && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl">
        <SheetHeader className="px-5 pt-5 pb-0">
          <SheetTitle className="text-lg font-semibold">
            {action === "APPROVE" ? `Approve version ${review.version.number}` : action ? TITLES[action] : ""}
          </SheetTitle>
          <SheetDescription>
            {action === "APPROVE"
              ? isRevision
                ? `Approving makes this change your agreement with ${review.studio.name}, replacing version ${review.change?.previousVersionNumber ?? review.activeVersionNumber}.`
                : `Approving confirms these details as your agreement with ${review.studio.name}.`
              : action === "REQUEST_CHANGES"
                ? `${review.studio.name} will update the details and send you a new version to review. Nothing is agreed yet.`
                : action === "DECLINE"
                  ? `Your current agreement (version ${review.change?.previousVersionNumber ?? review.activeVersionNumber}) stays exactly as it is.`
                  : `${review.studio.name} will tell you whether the change is possible and if the price or delivery date changes. Nothing changes until you approve a new version.`}
          </SheetDescription>
        </SheetHeader>

        <form
          noValidate
          className="space-y-5 px-5 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {action === "APPROVE" ? (
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-canvas p-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Total price</dt>
                <dd className="text-base font-semibold tabular">{formatKobo(review.terms.totalPriceKobo)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Deposit</dt>
                <dd className="text-base font-semibold tabular">{formatKobo(review.terms.depositRequiredKobo)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Delivery date</dt>
                <dd className="text-base font-semibold">{formatCalendarDate(review.terms.deliveryDate)}</dd>
              </div>
            </dl>
          ) : null}

          {action && action !== "APPROVE" ? (
            <Field data-invalid={Boolean(errors.comment)}>
              <FieldLabel htmlFor="portal-comment">{commentLabel}</FieldLabel>
              <Textarea
                id="portal-comment"
                rows={4}
                maxLength={2000}
                value={comment}
                aria-invalid={Boolean(errors.comment)}
                onChange={(e) => setComment(e.target.value)}
                placeholder={action === "DECLINE" ? "" : "e.g. Please make the sleeves elbow length and add more beads on the neckline."}
                className="text-base"
              />
              <FieldError>{errors.comment}</FieldError>
            </Field>
          ) : null}

          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="portal-name">Your name</FieldLabel>
            <Input
              id="portal-name"
              autoComplete="name"
              value={name}
              maxLength={80}
              aria-invalid={Boolean(errors.name)}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type your full name"
              className="h-12 text-base"
            />
            <FieldDescription>Recorded with your {action === "APPROVE" ? "approval" : "message"} and the time. It is not a verified signature.</FieldDescription>
            <FieldError>{errors.name}</FieldError>
          </Field>

          {action === "APPROVE" ? (
            <Field data-invalid={Boolean(errors.confirmed)}>
              <label
                htmlFor="portal-confirm"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-blue-tint/50"
              >
                <Checkbox
                  id="portal-confirm"
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                  aria-invalid={Boolean(errors.confirmed)}
                  className="mt-0.5 size-5"
                />
                <span className="text-sm font-medium">{review.confirmationText}</span>
              </label>
              <FieldError>{errors.confirmed}</FieldError>
            </Field>
          ) : null}

          {errors.form ? (
            <p role="alert" className="rounded-lg bg-[#fdecea] p-3 text-sm text-[#b42318]">
              {errors.form}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" className="h-12" onClick={onClose} disabled={busy}>
              Back to the details
            </Button>
            <Button
              type="submit"
              size="lg"
              className="h-12 text-base"
              variant={action === "DECLINE" ? "destructive" : "default"}
              disabled={busy}
            >
              {busy ? (
                <Spinner />
              ) : action === "APPROVE" ? (
                <BadgeCheck />
              ) : action === "DECLINE" ? (
                <X />
              ) : action === "CHANGE_REQUEST" ? (
                <Send />
              ) : (
                <MessageSquareText />
              )}
              {action === "APPROVE"
                ? `Approve version ${review.version.number}`
                : action === "DECLINE"
                  ? "Decline the change"
                  : "Send to the studio"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
