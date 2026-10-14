"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  GitCompareArrows,
  MessageSquareWarning,
  Pencil,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { EvidenceChips } from "@/components/workbench/evidence";
import type { BriefEditor } from "@/components/workbench/use-brief-editor";
import { api } from "@/lib/api";
import { toastError } from "@/lib/form-errors";
import { formatDateTime } from "@/lib/format";
import {
  EVIDENCE_BASIS_LABELS,
  ISSUE_KIND_LABELS,
  SUGGESTION_KEYS,
  SUGGESTION_KEY_LABELS,
  TEXT_FIELD_KEYS,
  FIELD_DEF_BY_KEY,
  type BriefDto,
  type IssueDto,
  type Readiness,
  type SuggestionDto,
} from "@/contracts/brief";
import { cn } from "@/lib/utils";

const ISSUE_ICON = {
  MISSING: CircleHelp,
  CONFLICT: GitCompareArrows,
  QUESTION: MessageSquareWarning,
  CUSTOMER_FEEDBACK: MessageSquareWarning,
} as const;

export function IssuesPanel({
  brief,
  editor,
  orderId,
  disabled,
  timeZone,
  isExample = false,
}: {
  brief: BriefDto;
  editor: BriefEditor;
  orderId: string;
  disabled: boolean;
  timeZone: string;
  /** The latest machine-flagged questions came from demo fixtures, not a live AI call. */
  isExample?: boolean;
}) {
  const open = brief.issues.filter((i) => i.status === "OPEN");
  const closed = brief.issues.filter((i) => i.status !== "OPEN").slice(0, 8);
  const [resolving, setResolving] = useState<IssueDto | null>(null);
  const [dismissing, setDismissing] = useState<IssueDto | null>(null);
  const [asking, setAsking] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  return (
    <section id="section-issues" aria-labelledby="issues-title" className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 id="issues-title" className="flex items-center gap-2 font-semibold">
          Questions and conflicts
          {open.length ? <Badge className="bg-amber-tint text-amber-ink">{open.length} open</Badge> : null}
        </h3>
        {!disabled ? (
          <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
            <Plus /> Add question
          </Button>
        ) : null}
      </div>
      {open.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-teal-ink" aria-hidden="true" /> No open questions or conflicts.
        </p>
      ) : (
        <ul className="space-y-3">
          {open.map((issue) => {
            const Icon = ISSUE_ICON[issue.kind];
            return (
              <li key={issue.id} className="space-y-2 rounded-lg border border-[#f6dfa3] bg-amber-tint/50 p-3">
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-amber-ink" aria-hidden="true" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-amber-ink">
                      {ISSUE_KIND_LABELS[issue.kind]} · {issue.fieldLabel}
                      {issue.origin === "AI"
                        ? isExample
                          ? " · from example results"
                          : " · flagged by AI"
                        : issue.origin === "CUSTOMER"
                          ? " · from the customer"
                          : ""}
                    </p>
                    <p className="text-sm">{issue.question}</p>
                  </div>
                </div>
                {issue.candidates?.length ? (
                  <ul className="space-y-1.5 pl-6">
                    {issue.candidates.map((c, i) => (
                      <li key={i} className="space-y-1 rounded-md bg-white p-2 ring-1 ring-border">
                        <p className="text-sm font-medium">“{c.value}”</p>
                        <EvidenceChips evidence={c.evidence} />
                      </li>
                    ))}
                  </ul>
                ) : issue.evidence?.length ? (
                  <EvidenceChips evidence={issue.evidence} className="pl-6" />
                ) : null}
                {!disabled ? (
                  <div className="flex flex-wrap gap-2 pl-6">
                    <Button size="sm" onClick={() => setResolving(issue)}>
                      <Check /> Resolve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDismissing(issue)}>
                      Not relevant
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {closed.length ? (
        <div>
          <button type="button" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline" onClick={() => setShowClosed((s) => !s)}>
            {showClosed ? "Hide" : "Show"} resolved ({closed.length})
          </button>
          {showClosed ? (
            <ul className="mt-2 space-y-1.5">
              {closed.map((i) => (
                <li key={i.id} className="rounded-md bg-canvas p-2 text-xs">
                  <span className="font-medium">{i.fieldLabel}:</span> {i.question}
                  <span className="block text-muted-foreground">
                    {i.status === "RESOLVED" ? `Resolved${i.resolvedValue ? ` — ${i.resolvedValue}` : ""}` : "Marked not relevant"}
                    {i.resolutionNote ? ` · ${i.resolutionNote}` : ""} · {formatDateTime(i.resolvedAt, timeZone)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {resolving ? <ResolveDialog issue={resolving} editor={editor} orderId={orderId} onClose={() => setResolving(null)} /> : null}
      {dismissing ? <DismissDialog issue={dismissing} editor={editor} orderId={orderId} onClose={() => setDismissing(null)} /> : null}
      {asking ? <AskDialog editor={editor} orderId={orderId} onClose={() => setAsking(false)} /> : null}
    </section>
  );
}

function ResolveDialog({ issue, editor, orderId, onClose }: { issue: IssueDto; editor: BriefEditor; orderId: string; onClose: () => void }) {
  const hasCandidates = Boolean(issue.candidates?.length);
  const canNA =
    issue.fieldKey && (TEXT_FIELD_KEYS as readonly string[]).includes(issue.fieldKey)
      ? FIELD_DEF_BY_KEY[issue.fieldKey as (typeof TEXT_FIELD_KEYS)[number]].allowNotApplicable
      : false;
  const [choice, setChoice] = useState<string>(hasCandidates ? "c0" : issue.fieldKey ? "value" : "note");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    let resolution: Record<string, unknown>;
    if (choice.startsWith("c")) resolution = { type: "CANDIDATE", candidateIndex: Number(choice.slice(1)), note: note || undefined };
    else if (choice === "value") resolution = { type: "VALUE", value, note: note || undefined };
    else if (choice === "na") resolution = { type: "NOT_APPLICABLE", note: note || undefined };
    else resolution = { type: "NOTE_ONLY", note };
    setBusy(true);
    try {
      await editor.runAction((expectedRevision) =>
        api<BriefDto>(`/orders/${orderId}/issues/${issue.id}/resolve`, { method: "POST", body: { expectedRevision, resolution } }),
      );
      toast.success("Resolved");
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  const valid = choice === "value" ? value.trim().length > 0 : choice === "note" ? note.trim().length >= 2 : true;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve: {issue.fieldLabel}</DialogTitle>
          <DialogDescription>{issue.question}</DialogDescription>
        </DialogHeader>
        <RadioGroup value={choice} onValueChange={setChoice} className="space-y-2">
          {issue.candidates?.map((c, i) => (
            <label key={i} className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-sm has-data-[state=checked]:border-primary/40 has-data-[state=checked]:bg-blue-tint/50">
              <RadioGroupItem value={`c${i}`} className="mt-0.5" />
              <span className="space-y-1">
                <span className="block font-medium">Use “{c.value}”</span>
                <EvidenceChips evidence={c.evidence} />
              </span>
            </label>
          ))}
          {issue.fieldKey ? (
            <label className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-sm has-data-[state=checked]:border-primary/40">
              <RadioGroupItem value="value" className="mt-0.5" />
              <span className="flex-1 space-y-1">
                <span className="block font-medium">Use a different value</span>
                {choice === "value" ? (
                  <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label="Agreed value" placeholder="What did you agree?" />
                ) : null}
              </span>
            </label>
          ) : null}
          {canNA ? (
            <label className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm has-data-[state=checked]:border-primary/40">
              <RadioGroupItem value="na" /> Not applicable to this garment
            </label>
          ) : null}
          <label className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm has-data-[state=checked]:border-primary/40">
            <RadioGroupItem value="note" /> Close with a note only (no change to the brief)
          </label>
        </RadioGroup>
        <div className="space-y-1">
          <Label htmlFor="resolve-note">{choice === "note" ? "Note *" : "Note (optional)"}</Label>
          <Input id="resolve-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Confirmed with customer by phone" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !valid}>
            {busy ? <Spinner /> : null} Save resolution
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DismissDialog({ issue, editor, orderId, onClose }: { issue: IssueDto; editor: BriefEditor; orderId: string; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await editor.runAction(() => api<BriefDto>(`/orders/${orderId}/issues/${issue.id}/dismiss`, { method: "POST", body: { note } }));
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as not relevant</DialogTitle>
          <DialogDescription>{issue.question}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="dismiss-note">Why is this not relevant? *</Label>
          <Input id="dismiss-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || note.trim().length < 2}>
            {busy ? <Spinner /> : null} Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AskDialog({ editor, orderId, onClose }: { editor: BriefEditor; orderId: string; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [fieldKey, setFieldKey] = useState<string>("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await editor.runAction(() =>
        api<BriefDto>(`/orders/${orderId}/issues`, { method: "POST", body: { question, fieldKey: fieldKey || null } }),
      );
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a question to confirm</DialogTitle>
          <DialogDescription>Open questions block sharing until they are resolved.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="q-text">Question</Label>
            <Input id="q-text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Should the lining be silk or cotton?" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="q-field">Related detail (optional)</Label>
            <select
              id="q-field"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">General</option>
              {SUGGESTION_KEYS.filter((k) => k !== "exclusion").map((k) => (
                <option key={k} value={k}>
                  {SUGGESTION_KEY_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || question.trim().length < 3}>
            {busy ? <Spinner /> : null} Add question
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SuggestionsPanel({
  suggestions,
  editor,
  orderId,
  disabled,
  staleNotice,
  isExample,
}: {
  suggestions: SuggestionDto[];
  editor: BriefEditor;
  orderId: string;
  disabled: boolean;
  staleNotice: string | null;
  isExample: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  if (!suggestions.length) return null;

  async function act(s: SuggestionDto, kind: "accept" | "reject", edited?: string) {
    setBusyId(s.id);
    try {
      await editor.runAction((expectedRevision) =>
        api<BriefDto>(`/orders/${orderId}/suggestions/${s.id}/${kind}`, {
          method: "POST",
          body: kind === "accept" ? { expectedRevision, ...(edited !== undefined ? { value: edited } : {}) } : {},
        }),
      );
      setEditing(null);
    } catch (error) {
      toastError(error);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="section-suggestions" aria-labelledby="suggestions-title" className="scroll-mt-24 space-y-3 rounded-xl border border-[#c9dcff] bg-blue-tint/40 p-5">
      <div className="space-y-1">
        <h3 id="suggestions-title" className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          {isExample ? "Example suggestions (demo fixture)" : "Suggestions to review"}
          <Badge variant="secondary">{suggestions.length}</Badge>
        </h3>
        <p className="text-sm text-muted-foreground">
          Nothing is added to the brief until you accept it. Check each suggestion against its source.
          {isExample ? " These are prepared examples for the synthetic demo, not live AI output." : ""}
        </p>
        {staleNotice ? (
          <p className="flex items-start gap-1.5 text-sm text-amber-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {staleNotice}
          </p>
        ) : null}
      </div>
      <ul className="space-y-2">
        {suggestions.map((s) => (
          <li key={s.id} className="space-y-2 rounded-lg border border-border bg-white p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-foreground">{s.fieldLabel}</span>
              <span className="text-muted-foreground">{EVIDENCE_BASIS_LABELS[s.basis]}</span>
              {s.needsHumanReview || s.basis === "INFERENCE" || s.basis === "VISUAL_OBSERVATION" ? (
                <Badge variant="outline" className="border-[#f6dfa3] text-amber-ink">
                  <CircleAlert className="size-3" /> Check carefully
                </Badge>
              ) : null}
            </div>
            {editing === s.id ? (
              <div className="flex gap-2">
                <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Edit ${s.fieldLabel}`} />
                <Button size="sm" onClick={() => act(s, "accept", value)} disabled={!value.trim() || busyId === s.id}>
                  Accept edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <p className="text-sm font-medium">{s.displayValue}</p>
            )}
            {s.currentValue && s.currentValue !== s.displayValue ? (
              <p className="text-xs text-muted-foreground">Currently in the brief: {s.currentValue}</p>
            ) : null}
            <EvidenceChips evidence={s.evidence} />
            {!disabled && editing !== s.id ? (
              <div className={cn("flex flex-wrap gap-2", busyId === s.id && "opacity-60")}>
                <Button size="sm" onClick={() => act(s, "accept")} disabled={busyId === s.id || s.proposedValue === null}>
                  <Check /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(s.id);
                    setValue(s.proposedValue === null ? "" : String(s.proposedValue));
                  }}
                >
                  <Pencil /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act(s, "reject")} disabled={busyId === s.id}>
                  <X /> Reject
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReadinessPanel({ readiness }: { readiness: Readiness }) {
  if (readiness.ready) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-[#b6ebe6] bg-teal-tint p-4 text-sm text-teal-ink">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">Ready for customer review</p>
          <p>Every required detail is set and there are no open questions.</p>
          {readiness.warnings.length ? (
            <ul className="mt-1 list-disc pl-4 text-amber-ink">
              {readiness.warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[#f6dfa3] bg-amber-tint/60 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-ink">
        <CircleAlert className="size-4" aria-hidden="true" /> Before sharing ({readiness.blocking.length})
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {readiness.blocking.map((item, i) => (
          <li key={i}>
            <a
              href={`#section-${item.section === "issues" ? "issues" : item.section}`}
              className="text-foreground underline decoration-dotted underline-offset-4 hover:text-primary"
            >
              {item.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
