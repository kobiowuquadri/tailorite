"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { COMMON_TIME_ZONES, MEASUREMENT_UNIT_LABELS, OnboardingInput } from "@/contracts/studio";
import { api, isApiError } from "@/lib/api";
import { qk, useSession } from "@/lib/queries";
import { applyServerErrors } from "@/lib/form-errors";
import type { z } from "zod";

type Values = z.input<typeof OnboardingInput>;

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const form = useForm<Values>({
    resolver: zodResolver(OnboardingInput),
    defaultValues: {
      studioName: "",
      ownerName: "",
      phone: "",
      email: "",
      city: "",
      timeZone: "Africa/Lagos",
      currency: "NGN",
    },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (isApiError(session.error, "UNAUTHENTICATED")) router.replace("/login?next=/onboarding");
    if (session.data?.studio) router.replace("/dashboard");
    if (session.data && !form.getValues("ownerName")) form.setValue("ownerName", session.data.user.name);
  }, [session.data, session.error, router, form]);

  async function onSubmit(values: Values) {
    try {
      await api("/studios", { method: "POST", body: values });
      await queryClient.invalidateQueries({ queryKey: qk.session });
      router.replace("/dashboard");
    } catch (error) {
      applyServerErrors(error, form.setError, ["studioName", "ownerName", "phone", "email", "city", "measurementUnit", "timeZone"]);
    }
  }

  if (session.isPending || session.data?.studio) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your studio</h1>
        <p className="text-sm text-muted-foreground">These details appear on the briefs your customers review.</p>
      </div>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.studioName)}>
            <FieldLabel htmlFor="studioName">Studio name</FieldLabel>
            <Input id="studioName" aria-invalid={Boolean(errors.studioName)} {...form.register("studioName")} />
            <FieldError errors={[errors.studioName]} />
          </Field>
          <Field data-invalid={Boolean(errors.ownerName)}>
            <FieldLabel htmlFor="ownerName">Owner name</FieldLabel>
            <Input id="ownerName" autoComplete="name" aria-invalid={Boolean(errors.ownerName)} {...form.register("ownerName")} />
            <FieldError errors={[errors.ownerName]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.phone)}>
              <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
              <Input id="phone" type="tel" autoComplete="tel" {...form.register("phone")} />
              <FieldError errors={[errors.phone]} />
            </Field>
            <Field data-invalid={Boolean(errors.city)}>
              <FieldLabel htmlFor="city">City (optional)</FieldLabel>
              <Input id="city" autoComplete="address-level2" {...form.register("city")} />
              <FieldError errors={[errors.city]} />
            </Field>
          </div>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="studioEmail">Studio email (optional)</FieldLabel>
            <Input id="studioEmail" type="email" {...form.register("email")} />
            <FieldError errors={[errors.email]} />
          </Field>

          <FieldSet data-invalid={Boolean(errors.measurementUnit)}>
            <FieldLegend variant="label">Measurement unit</FieldLegend>
            <FieldDescription>Choose the unit you usually measure in. You can change it later in settings.</FieldDescription>
            <Controller
              control={form.control}
              name="measurementUnit"
              render={({ field }) => (
                <RadioGroup
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  className="grid grid-cols-2 gap-3"
                  aria-invalid={Boolean(errors.measurementUnit)}
                >
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
            <FieldError errors={[errors.measurementUnit]} />
          </FieldSet>

          <div className="grid gap-4 sm:grid-cols-2">
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
                      {COMMON_TIME_ZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.timeZone]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="currency">Currency</FieldLabel>
              <Input id="currency" value="Nigerian naira (₦)" readOnly disabled />
            </Field>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null} Create studio
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
