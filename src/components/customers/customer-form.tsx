"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { CustomerInput } from "@/contracts/customers";
import { applyServerErrors } from "@/lib/form-errors";
import type { z } from "zod";

export type CustomerFormValues = z.input<typeof CustomerInput>;

export function CustomerForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  defaultValues?: Partial<CustomerFormValues>;
  submitLabel: string;
  onSubmit: (values: z.output<typeof CustomerInput>) => Promise<void>;
  onCancel?: () => void;
}) {
  const form = useForm<CustomerFormValues, unknown, z.output<typeof CustomerInput>>({
    resolver: zodResolver(CustomerInput),
    defaultValues: { name: "", phone: "", email: "", notes: "", ...defaultValues },
  });
  const { errors, isSubmitting } = form.formState;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await onSubmit(values);
        } catch (error) {
          applyServerErrors(error, form.setError, ["name", "phone", "email", "notes"]);
        }
      })}
    >
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="customer-name">Full name</FieldLabel>
          <Input id="customer-name" aria-invalid={Boolean(errors.name)} {...form.register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="customer-phone">Phone (optional)</FieldLabel>
            <Input id="customer-phone" type="tel" placeholder="0803 000 0000" {...form.register("phone")} />
            <FieldDescription>Used to open WhatsApp with a prefilled message. Tailorite never sends messages itself.</FieldDescription>
            <FieldError errors={[errors.phone]} />
          </Field>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="customer-email">Email (optional)</FieldLabel>
            <Input id="customer-email" type="email" {...form.register("email")} />
            <FieldError errors={[errors.email]} />
          </Field>
        </div>
        <Field data-invalid={Boolean(errors.notes)}>
          <FieldLabel htmlFor="customer-notes">Studio notes (optional)</FieldLabel>
          <Textarea id="customer-notes" rows={3} {...form.register("notes")} />
          <FieldDescription>Only your studio sees these notes.</FieldDescription>
          <FieldError errors={[errors.notes]} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null} {submitLabel}
          </Button>
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </FieldGroup>
    </form>
  );
}
