"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Banknote, CircleAlert, Plus, Undo2 } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/common/states";
import { ReasonDialog } from "@/components/order/reason-dialog";
import { MoneyInput } from "@/components/workbench/money-input";
import { api, newIdempotencyKey } from "@/lib/api";
import { invalidateOrder, qk } from "@/lib/queries";
import { applyServerErrors } from "@/lib/form-errors";
import { formatCalendarDate, formatDateTime, formatMoney, todayInZone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYMENT_KIND_LABELS, RecordPaymentInput, type FinanceDto, type PaymentDto } from "@/contracts/payments";
import type { OrderDetailDto } from "@/contracts/orders";

type FormValues = z.input<typeof RecordPaymentInput>;

const KIND_HELP: Record<"DEPOSIT" | "PAYMENT" | "REFUND", string> = {
  DEPOSIT: "Money received before work starts",
  PAYMENT: "Any other money received from the customer",
  REFUND: "Money you gave back to the customer",
};

function RecordPaymentDialog({
  open,
  onOpenChange,
  orderId,
  timeZone,
  suggestedKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  timeZone: string;
  suggestedKind: "DEPOSIT" | "PAYMENT";
}) {
  const queryClient = useQueryClient();
  const today = todayInZone(timeZone);
  const blank = (): FormValues => ({
    kind: suggestedKind,
    amountKobo: Number.NaN,
    receivedOn: today,
    method: "",
    note: "",
    idempotencyKey: newIdempotencyKey(),
  });
  const form = useForm<FormValues, unknown, z.output<typeof RecordPaymentInput>>({
    resolver: zodResolver(RecordPaymentInput),
    defaultValues: blank(),
  });
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) form.reset(blank());
  }
  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Write down money that changed hands. Tailorite does not move money — entries are marked “Recorded by studio”.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const finance = await api<FinanceDto>(`/orders/${orderId}/payments`, { method: "POST", body: values });
              queryClient.setQueryData(qk.finance(orderId), finance);
              await invalidateOrder(queryClient, orderId);
              toast.success(`${PAYMENT_KIND_LABELS[values.kind]}: ${formatMoney(values.amountKobo)} recorded`);
              onOpenChange(false);
            } catch (error) {
              applyServerErrors(error, form.setError, ["kind", "amountKobo", "receivedOn", "method", "note"]);
            }
          })}
        >
          <FieldGroup>
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FieldSet>
                  <FieldLegend variant="label">Type of entry</FieldLegend>
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2 sm:grid-cols-3">
                    {(["DEPOSIT", "PAYMENT", "REFUND"] as const).map((k) => (
                      <Label
                        key={k}
                        htmlFor={`kind-${k}`}
                        className={cn(
                          "flex cursor-pointer flex-col items-start gap-1 rounded-lg border border-border p-3 font-normal",
                          field.value === k && "border-primary bg-blue-tint/50",
                        )}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <RadioGroupItem id={`kind-${k}`} value={k} />
                          {PAYMENT_KIND_LABELS[k]}
                        </span>
                        <span className="text-xs text-muted-foreground">{KIND_HELP[k]}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </FieldSet>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.amountKobo)}>
                <FieldLabel htmlFor="payment-amount">Amount</FieldLabel>
                <Controller
                  control={form.control}
                  name="amountKobo"
                  render={({ field }) => (
                    <MoneyInput
                      id="payment-amount"
                      valueKobo={Number.isNaN(field.value) ? null : field.value}
                      onChange={(kobo) => field.onChange(kobo ?? Number.NaN)}
                      invalid={Boolean(errors.amountKobo)}
                    />
                  )}
                />
                <FieldError errors={[errors.amountKobo]} />
              </Field>
              <Field data-invalid={Boolean(errors.receivedOn)}>
                <FieldLabel htmlFor="payment-date">Date</FieldLabel>
                <Input id="payment-date" type="date" max={today} {...form.register("receivedOn")} />
                <FieldError errors={[errors.receivedOn]} />
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.method)}>
              <FieldLabel htmlFor="payment-method">How it was paid (optional)</FieldLabel>
              <Input id="payment-method" list="payment-methods" placeholder="Bank transfer, cash, POS…" {...form.register("method")} />
              <datalist id="payment-methods">
                <option value="Bank transfer" />
                <option value="Cash" />
                <option value="POS" />
                <option value="Mobile money" />
              </datalist>
              <FieldError errors={[errors.method]} />
            </Field>
            <Field data-invalid={Boolean(errors.note)}>
              <FieldLabel htmlFor="payment-note">Note (optional)</FieldLabel>
              <Input id="payment-note" placeholder="e.g. Transfer reference or who paid" {...form.register("note")} />
              <FieldDescription>Only your studio sees payment entries.</FieldDescription>
              <FieldError errors={[errors.note]} />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : <Banknote />} Record entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** What the balance would become if the proposed total were approved (never shown as agreed). */
function wouldBe(differenceKobo: number) {
  return differenceKobo >= 0
    ? `If the customer approves, the balance becomes ${formatMoney(differenceKobo)}.`
    : `If the customer approves, ${formatMoney(-differenceKobo)} becomes due back to the customer.`;
}

function Amount({ label, value, emphasis, tone }: { label: string; value: string; emphasis?: boolean; tone?: "coral" | "teal" }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular",
          emphasis ? "text-xl font-semibold" : "font-semibold",
          tone === "coral" && "text-coral-ink",
          tone === "teal" && "text-teal-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function EntryRow({
  entry,
  byId,
  timeZone,
  canCorrect,
  onCorrect,
}: {
  entry: PaymentDto;
  byId: Map<string, PaymentDto>;
  timeZone: string;
  canCorrect: boolean;
  onCorrect: (entry: PaymentDto) => void;
}) {
  const reversed = Boolean(entry.reversedById);
  const original = entry.reversesId ? byId.get(entry.reversesId) : null;
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <p className={cn("text-sm font-medium", reversed && "text-muted-foreground line-through decoration-1")}>
          {PAYMENT_KIND_LABELS[entry.kind]}
          {entry.method ? <span className="font-normal text-muted-foreground"> · {entry.method}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatCalendarDate(entry.receivedOn)} · Recorded by studio{entry.recordedBy ? ` (${entry.recordedBy})` : ""} on{" "}
          {formatDateTime(entry.createdAt, timeZone)}
        </p>
        {original ? (
          <p className="text-xs text-muted-foreground">
            Corrects {PAYMENT_KIND_LABELS[original.kind].toLowerCase()} of {formatMoney(original.amountKobo)} from{" "}
            {formatCalendarDate(original.receivedOn)}
          </p>
        ) : null}
        {entry.note ? <p className="text-sm">{entry.note}</p> : null}
        {reversed ? <p className="text-xs font-medium text-amber-ink">Corrected by a later entry</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("tabular text-sm font-semibold", entry.signedAmountKobo < 0 && "text-coral-ink")}>
          {entry.signedAmountKobo < 0 ? "−" : "+"}
          {formatMoney(Math.abs(entry.signedAmountKobo))}
        </span>
        {canCorrect && entry.kind !== "REVERSAL" && !reversed ? (
          <Button variant="ghost" size="sm" onClick={() => onCorrect(entry)} aria-label={`Correct ${PAYMENT_KIND_LABELS[entry.kind]} of ${formatMoney(entry.amountKobo)}`}>
            <Undo2 /> Correct
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function PaymentsSection({ order, timeZone }: { order: OrderDetailDto; timeZone: string }) {
  const queryClient = useQueryClient();
  const finance = useQuery({ queryKey: qk.finance(order.id), queryFn: () => api<FinanceDto>(`/orders/${order.id}/payments`) });
  const [recording, setRecording] = useState(false);
  const [correcting, setCorrecting] = useState<PaymentDto | null>(null);
  const [reverseKey, setReverseKey] = useState(newIdempotencyKey);
  const canRecord = !order.archivedAt;

  async function reverse(entry: PaymentDto, note: string) {
    const res = await api<FinanceDto>(`/orders/${order.id}/payments/${entry.id}/reverse`, {
      method: "POST",
      body: { note, idempotencyKey: reverseKey },
    });
    queryClient.setQueryData(qk.finance(order.id), res);
    setReverseKey(newIdempotencyKey());
    await invalidateOrder(queryClient, order.id);
    toast.success("Correction recorded. The original entry stays in the history.");
  }

  const f = finance.data;
  const byId = new Map((f?.entries ?? []).map((e) => [e.id, e]));
  const depositPaid = f ? f.received.depositsKobo + f.received.paymentsKobo > 0 : false;

  return (
    <section id="payments" aria-labelledby="payments-title" className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="payments-title" className="text-lg font-semibold">
          Money
        </h2>
        {canRecord ? (
          <Button variant="outline" size="sm" onClick={() => setRecording(true)}>
            <Plus /> Record payment
          </Button>
        ) : null}
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-white p-5">
        {finance.error ? (
          <ErrorState error={finance.error} onRetry={() => finance.refetch()} />
        ) : !f ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {f.agreed ? (
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Amount label={`Agreed total (version ${f.agreed.versionNumber})`} value={formatMoney(f.agreed.totalKobo)} />
                <Amount label="Received (recorded by studio)" value={formatMoney(f.received.netKobo)} />
                {f.creditDueKobo && f.creditDueKobo > 0 ? (
                  <Amount label="Credit / refund due to customer" value={formatMoney(f.creditDueKobo)} emphasis tone="coral" />
                ) : (
                  <Amount label="Balance due" value={formatMoney(f.balanceDueKobo)} emphasis tone={f.balanceDueKobo === 0 ? "teal" : undefined} />
                )}
                {f.depositOutstandingKobo && f.depositOutstandingKobo > 0 ? (
                  <Amount label="Deposit still to collect" value={formatMoney(f.depositOutstandingKobo)} tone="coral" />
                ) : (
                  <Amount label="Deposit required" value={formatMoney(f.agreed.depositRequiredKobo)} />
                )}
              </dl>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  There is no approved agreement yet, so there is no balance. Amounts below are estimates from the proposed terms.
                </p>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Amount label="Proposed total (estimate)" value={formatMoney(f.proposed?.totalKobo)} />
                  <Amount label="Received (recorded by studio)" value={formatMoney(f.received.netKobo)} />
                  {f.estimatedBalanceKobo !== null && f.estimatedBalanceKobo < 0 ? (
                    <Amount label="Received above proposed total" value={formatMoney(-f.estimatedBalanceKobo)} tone="coral" />
                  ) : (
                    <Amount label="Estimated balance" value={formatMoney(f.estimatedBalanceKobo)} />
                  )}
                </dl>
              </div>
            )}

            {f.agreed && f.proposed && f.proposed.totalKobo !== null ? (
              <div className="flex items-start gap-2 rounded-lg border border-[#ffcfc6] bg-coral-tint/50 p-3 text-sm">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-coral-ink" aria-hidden="true" />
                <p>
                  {f.proposed.source === "PENDING_VERSION"
                    ? `Version ${f.proposed.versionNumber} proposes a total of ${formatMoney(f.proposed.totalKobo)}`
                    : `The change being prepared proposes a total of ${formatMoney(f.proposed.totalKobo)}`}
                  {f.proposed.adjustmentKobo !== null && f.proposed.adjustmentKobo !== 0
                    ? ` (${f.proposed.adjustmentKobo > 0 ? "+" : "−"}${formatMoney(Math.abs(f.proposed.adjustmentKobo))})`
                    : ""}
                  . It is not agreed yet — the balance above uses version {f.agreed.versionNumber}. {wouldBe(f.proposed.totalKobo - f.received.netKobo)}
                </p>
              </div>
            ) : null}

            {f.received.refundsKobo > 0 || f.received.reversalsKobo !== 0 ? (
              <p className="text-xs text-muted-foreground">
                Deposits {formatMoney(f.received.depositsKobo)} · payments {formatMoney(f.received.paymentsKobo)} · refunds{" "}
                {formatMoney(f.received.refundsKobo)} · corrections {formatMoney(f.received.reversalsKobo)}
              </p>
            ) : null}

            <div className="border-t border-border pt-4">
              {f.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments recorded yet.{" "}
                  {canRecord ? (
                    <button type="button" className="font-medium text-primary hover:underline" onClick={() => setRecording(true)}>
                      Record {depositPaid ? "a payment" : "the deposit"}
                    </button>
                  ) : null}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {f.entries.map((e) => (
                    <EntryRow key={e.id} entry={e} byId={byId} timeZone={timeZone} canCorrect={canRecord} onCorrect={setCorrecting} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <RecordPaymentDialog
        open={recording}
        onOpenChange={setRecording}
        orderId={order.id}
        timeZone={timeZone}
        suggestedKind={depositPaid ? "PAYMENT" : "DEPOSIT"}
      />
      <ReasonDialog
        open={Boolean(correcting)}
        onOpenChange={(o) => !o && setCorrecting(null)}
        title="Correct this entry"
        description={
          correcting ? (
            <>
              Adds an opposite entry of {formatMoney(correcting.amountKobo)} so the {PAYMENT_KIND_LABELS[correcting.kind].toLowerCase()} from{" "}
              {formatCalendarDate(correcting.receivedOn)} no longer counts. The original stays visible in the history. Record the right amount
              afterwards if needed.
            </>
          ) : null
        }
        label="What was wrong?"
        placeholder="e.g. Amount typed incorrectly — it was $250"
        maxLength={500}
        confirmLabel="Record correction"
        onConfirm={(note) => reverse(correcting!, note)}
      />
    </section>
  );
}
