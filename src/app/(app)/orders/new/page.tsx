"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/common/states";
import { CustomerPicker, type PickedCustomer } from "@/components/customers/customer-picker";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/queries";
import { toastError } from "@/lib/form-errors";
import { CreateOrderInput, type OrderSummaryDto } from "@/contracts/orders";
import type { CustomerDto } from "@/contracts/customers";

const GARMENT_SUGGESTIONS = [
  "Dress",
  "Evening gown",
  "Wedding dress",
  "Iro and buba",
  "Agbada",
  "Kaftan",
  "Senator suit",
  "Two-piece suit",
  "Skirt and blouse",
  "Trousers",
  "Jumpsuit",
];

export default function NewOrderPage() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const preset = params.get("customerId");
  const presetCustomer = useQuery({
    queryKey: qk.customer(preset ?? ""),
    queryFn: () => api<CustomerDto>(`/customers/${preset}`),
    enabled: Boolean(preset),
  });
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [title, setTitle] = useState("");
  const [garmentType, setGarmentType] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [adoptedPreset, setAdoptedPreset] = useState(false);
  if (presetCustomer.data && !customer && !adoptedPreset) {
    setAdoptedPreset(true);
    setCustomer({ id: presetCustomer.data.id, name: presetCustomer.data.name });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = CreateOrderInput.safeParse({ customerId: customer?.id, title, garmentType });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      if (!customer) next.customerId = "Choose a customer";
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const order = await api<OrderSummaryDto>("/orders", { method: "POST", body: parsed.data });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: qk.dashboard });
      router.push(`/orders/${order.id}/brief`);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        setErrors(Object.fromEntries(Object.entries(error.fieldErrors).map(([k, v]) => [k, v[0]])));
      } else {
        toastError(error);
      }
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="New order"
        description="One garment per order. Next, you will add the customer's messages, pictures and voice notes."
      />
      <form onSubmit={submit} noValidate className="rounded-xl border border-border bg-white p-6">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.customerId)}>
            <FieldLabel>Customer</FieldLabel>
            <CustomerPicker value={customer} onChange={setCustomer} invalid={Boolean(errors.customerId)} />
            {errors.customerId ? <FieldError>{errors.customerId}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.title)}>
            <FieldLabel htmlFor="title">Order title</FieldLabel>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Navy dress for wedding reception"
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title ? <FieldError>{errors.title}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.garmentType)}>
            <FieldLabel htmlFor="garmentType">Garment type</FieldLabel>
            <Input
              id="garmentType"
              list="garment-suggestions"
              value={garmentType}
              onChange={(e) => setGarmentType(e.target.value)}
              placeholder="e.g. Dress"
              aria-invalid={Boolean(errors.garmentType)}
            />
            <datalist id="garment-suggestions">
              {GARMENT_SUGGESTIONS.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <FieldDescription>Multi-garment packages are not supported yet — create one order per garment.</FieldDescription>
            {errors.garmentType ? <FieldError>{errors.garmentType}</FieldError> : null}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? <Spinner /> : null} Create order
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}
