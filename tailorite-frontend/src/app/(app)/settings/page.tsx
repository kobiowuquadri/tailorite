"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, CircleCheck, CircleOff, Cpu, Database, Receipt, ShieldCheck } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { api } from "@/lib/api";
import { qk, useAiStatus, useStudio, useUsage } from "@/lib/queries";
import { applyServerErrors } from "@/lib/form-errors";
import { formatBytes, formatDateTime, formatKobo } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  COMMON_TIME_ZONES,
  MEASUREMENT_UNIT_LABELS,
  PRICING_HYPOTHESIS,
  UpdateStudioInput,
  type StudioDto,
} from "@/contracts/studio";

type Values = z.input<typeof UpdateStudioInput>;

function Card({ title, icon: Icon, children, className }: { title: string; icon: typeof Bot; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-4 rounded-xl border border-border bg-white p-5", className)} aria-label={title}>
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" /> {title}
      </h2>
      {children}
    </section>
  );
}

function StudioForm({ studio }: { studio: StudioDto }) {
  const queryClient = useQueryClient();
  const toValues = (s: StudioDto): Values => ({
    studioName: s.name,
    ownerName: s.ownerName,
    phone: s.phone ?? "",
    email: s.email ?? "",
    city: s.city ?? "",
    measurementUnit: s.measurementUnit,
    timeZone: s.timeZone,
    currency: "NGN",
  });
  const form = useForm<Values>({ resolver: zodResolver(UpdateStudioInput), defaultValues: toValues(studio) });
  const { errors, isSubmitting, isDirty } = form.formState;
  const zones: string[] = COMMON_TIME_ZONES.includes(studio.timeZone as (typeof COMMON_TIME_ZONES)[number])
    ? [...COMMON_TIME_ZONES]
    : [studio.timeZone, ...COMMON_TIME_ZONES];

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        try {
          const updated = await api<StudioDto>("/studio", { method: "PATCH", body: values });
          queryClient.setQueryData(qk.studio, updated);
          await queryClient.invalidateQueries({ queryKey: qk.session });
          form.reset(toValues(updated));
          toast.success("Studio details saved");
        } catch (error) {
          applyServerErrors(error, form.setError, ["studioName", "ownerName", "phone", "email", "city", "measurementUnit", "timeZone"]);
        }
      })}
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.studioName)}>
            <FieldLabel htmlFor="studioName">Studio name</FieldLabel>
            <Input id="studioName" aria-invalid={Boolean(errors.studioName)} {...form.register("studioName")} />
            <FieldDescription>Shown to customers on review pages and printed briefs.</FieldDescription>
            <FieldError errors={[errors.studioName]} />
          </Field>
          <Field data-invalid={Boolean(errors.ownerName)}>
            <FieldLabel htmlFor="ownerName">Owner name</FieldLabel>
            <Input id="ownerName" aria-invalid={Boolean(errors.ownerName)} {...form.register("ownerName")} />
            <FieldError errors={[errors.ownerName]} />
          </Field>
          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
            <Input id="phone" type="tel" {...form.register("phone")} />
            <FieldDescription>Customers see it on the review page so they can call you.</FieldDescription>
            <FieldError errors={[errors.phone]} />
          </Field>
          <Field data-invalid={Boolean(errors.city)}>
            <FieldLabel htmlFor="city">City (optional)</FieldLabel>
            <Input id="city" {...form.register("city")} />
            <FieldError errors={[errors.city]} />
          </Field>
          <Field data-invalid={Boolean(errors.email)} className="sm:col-span-2">
            <FieldLabel htmlFor="studioEmail">Studio email (optional)</FieldLabel>
            <Input id="studioEmail" type="email" {...form.register("email")} />
            <FieldError errors={[errors.email]} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldSet>
            <FieldLegend variant="label">Default measurement unit</FieldLegend>
            <Controller
              control={form.control}
              name="measurementUnit"
              render={({ field }) => (
                <RadioGroup value={field.value ?? ""} onValueChange={field.onChange} className="grid grid-cols-2 gap-3">
                  {(["INCH", "CM"] as const).map((unit) => (
                    <FieldLabel key={unit} htmlFor={`unit-${unit}`}>
                      <Field orientation="horizontal">
                        <RadioGroupItem value={unit} id={`unit-${unit}`} />
                        <span className="text-sm font-medium">{MEASUREMENT_UNIT_LABELS[unit]}</span>
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              )}
            />
            <FieldDescription>Used for new measurement profiles. Existing measurements keep their own unit.</FieldDescription>
          </FieldSet>
          <Field data-invalid={Boolean(errors.timeZone)}>
            <FieldLabel htmlFor="timeZone">Time zone</FieldLabel>
            <Controller
              control={form.control}
              name="timeZone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="timeZone" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>Times in history and on review pages are shown in this zone. Currency: Nigerian naira (₦).</FieldDescription>
            <FieldError errors={[errors.timeZone]} />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Spinner /> : null} Save changes
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-canvas p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular">{value}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

export default function SettingsPage() {
  const studio = useStudio();
  const usage = useUsage();
  const ai = useAiStatus();
  const [showModels, setShowModels] = useState(false);

  if (studio.isPending) return <PageSkeleton rows={4} />;
  if (studio.error) return <ErrorState error={studio.error} onRetry={() => studio.refetch()} />;
  const tz = studio.data.timeZone;
  const pricePerOrder = formatKobo(PRICING_HYPOTHESIS.proposedPricePerApprovedOrderKobo);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Studio details, AI availability, usage and how data is handled." />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Studio details" icon={ShieldCheck}>
            <StudioForm key={studio.data.id} studio={studio.data} />
          </Card>

          <Card title="Usage" icon={Receipt}>
            {usage.error ? (
              <ErrorState error={usage.error} onRetry={() => usage.refetch()} />
            ) : !usage.data ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat label="Approved orders" value={String(usage.data.approvedOrders)} />
                  <Stat label="Orders created" value={String(usage.data.ordersCreated)} />
                  <Stat label="Customers" value={String(usage.data.customers)} />
                  <Stat label="AI runs today" value={String(usage.data.aiJobsToday)} />
                  <Stat label="AI runs, last 30 days" value={String(usage.data.aiJobsLast30Days)} />
                  <Stat label="Private files stored" value={formatBytes(usage.data.storageBytes)} />
                </dl>
                <div className="space-y-2 rounded-lg border border-[#c9dcff] bg-blue-tint/50 p-4 text-sm">
                  <p className="font-medium">Proposed pricing — a hypothesis, not active</p>
                  <p>
                    The first {PRICING_HYPOTHESIS.freeApprovedOrders} approved orders would be free, then {pricePerOrder} per newly approved
                    order, with revisions included. <strong>Billing is not active in this release</strong>: nothing is charged and no
                    workflow is locked.
                  </p>
                  <p className="text-muted-foreground">
                    Under that proposal this studio would have {usage.data.freeApprovedOrdersRemaining} free approved order
                    {usage.data.freeApprovedOrdersRemaining === 1 ? "" : "s"} left, and {formatKobo(usage.data.hypotheticalChargeKobo)} would
                    have been billed so far (not charged).
                  </p>
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="AI availability" icon={Bot}>
            {ai.error ? (
              <ErrorState error={ai.error} onRetry={() => ai.refetch()} />
            ) : !ai.data ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  {ai.data.available ? (
                    <CircleCheck className="size-4 text-teal-ink" aria-hidden="true" />
                  ) : (
                    <CircleOff className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  {ai.data.label}
                </p>
                <p className="text-muted-foreground">{ai.data.message}</p>
                <dl className="grid grid-cols-2 gap-3">
                  <Stat label="Runs used today" value={`${ai.data.limits.usedToday} of ${ai.data.limits.jobsPerDay}`} />
                  <Stat label="Sources per run" value={`Up to ${ai.data.limits.maxSourcesPerJob}`} />
                </dl>
                <p className={cn("flex items-start gap-2", ai.data.worker.online ? "text-teal-ink" : "text-amber-ink")}>
                  <Cpu className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {ai.data.worker.online
                    ? "Background worker is running."
                    : `Background worker is offline${ai.data.worker.lastSeenAt ? ` (last seen ${formatDateTime(ai.data.worker.lastSeenAt, tz)})` : ""}. Processing requests wait in the queue until it starts.`}
                </p>
                {ai.data.models ? (
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setShowModels((s) => !s)}>
                    {showModels ? "Hide" : "Show"} model details
                  </button>
                ) : null}
                {showModels && ai.data.models ? (
                  <p className="text-xs text-muted-foreground">
                    Extraction: {ai.data.models.extraction} · transcription: {ai.data.models.transcription}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  AI only suggests. Nothing reaches the brief until someone in your studio accepts it, and every suggestion links to the message,
                  picture or recording it came from.
                </p>
              </div>
            )}
          </Card>

          <Card title="How data is handled" icon={Database}>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Messages, pictures and voice notes are stored privately for your studio. Files are served only to signed-in members of this studio
                — and the reference pictures you select, to the customer through their review link.
              </li>
              <li>
                Customers see only what you share: the version they review, its selected reference pictures and the price and dates. Never your
                internal notes, other orders or the original conversations.
              </li>
              <li>
                Customer links are private and expire. Only a fingerprint of each link is stored, so a lost link cannot be shown again — create a
                new one instead.
              </li>
              <li>
                When live AI is turned on and you start processing an order, that order&apos;s sources are sent to the configured AI provider
                (Google Gemini API) to produce suggestions. In manual mode nothing is sent.
              </li>
              <li>Approved versions, approvals and payment entries are kept as an unchangeable history. Corrections are added, never overwritten.</li>
              <li>Payments are recorded by your studio. Tailorite does not process or verify payments.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
