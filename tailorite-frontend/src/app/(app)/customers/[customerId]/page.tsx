"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Pencil, Phone, Plus, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { CustomerForm } from "@/components/customers/customer-form";
import { MeasurementValuesEditor } from "@/components/customers/measurement-editor";
import { OrderListItem } from "@/components/orders/order-list-item";
import { api, isApiError } from "@/lib/api";
import { qk, useSession } from "@/lib/queries";
import { formatCalendarDate, formatDateShort, todayInZone } from "@/lib/format";
import { toastError } from "@/lib/form-errors";
import { MEASUREMENT_UNIT_LABELS, MEASUREMENT_UNIT_SHORT, type MeasurementUnit } from "@/contracts/studio";
import type { CustomerDto, MeasurementValue } from "@/contracts/customers";
import type { OrderSummaryDto } from "@/contracts/orders";
import type { Page } from "@/contracts/common";

export default function CustomerPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const queryClient = useQueryClient();
  const session = useSession();
  const [editingContact, setEditingContact] = useState(false);
  const customer = useQuery({
    queryKey: qk.customer(customerId),
    queryFn: () => api<CustomerDto>(`/customers/${customerId}`),
  });
  const orders = useQuery({
    queryKey: qk.orders({ customerId, view: "all" }),
    queryFn: () => api<Page<OrderSummaryDto>>(`/orders?customerId=${customerId}&view=all&pageSize=50`),
  });

  if (customer.isPending) return <PageSkeleton />;
  if (customer.error) {
    return isApiError(customer.error, "NOT_FOUND") ? (
      <ErrorState error={customer.error} title="Customer not found" />
    ) : (
      <ErrorState error={customer.error} onRetry={() => customer.refetch()} />
    );
  }
  const c = customer.data;
  const timeZone = session.data?.studio?.timeZone ?? "Africa/Lagos";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/customers" className="hover:text-primary">Customers</Link>}
        title={c.name}
        description={c.isSynthetic ? "Synthetic demo customer" : `Customer since ${formatDateShort(c.createdAt, timeZone)}`}
        actions={
          <Button asChild>
            <Link href={`/orders/new?customerId=${c.id}`}>
              <Plus /> New order
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="space-y-4 rounded-xl border border-border bg-white p-5" aria-labelledby="contact">
          <div className="flex items-center justify-between">
            <h2 id="contact" className="font-semibold">
              Contact
            </h2>
            {!editingContact ? (
              <Button variant="ghost" size="sm" onClick={() => setEditingContact(true)}>
                <Pencil /> Edit
              </Button>
            ) : null}
          </div>
          {editingContact ? (
            <CustomerForm
              defaultValues={{ name: c.name, phone: c.phone ?? "", email: c.email ?? "", notes: c.notes ?? "" }}
              submitLabel="Save changes"
              onCancel={() => setEditingContact(false)}
              onSubmit={async (values) => {
                const updated = await api<CustomerDto>(`/customers/${c.id}`, { method: "PATCH", body: values });
                queryClient.setQueryData(qk.customer(c.id), updated);
                await queryClient.invalidateQueries({ queryKey: ["customers"] });
                setEditingContact(false);
                toast.success("Customer updated");
              }}
            />
          ) : (
            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                <dt className="sr-only">Phone</dt>
                <dd>{c.phone ?? <span className="text-muted-foreground">No phone</span>}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                <dt className="sr-only">Email</dt>
                <dd>{c.email ?? <span className="text-muted-foreground">No email</span>}</dd>
              </div>
              {c.notes ? (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Studio notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{c.notes}</dd>
                </div>
              ) : null}
            </dl>
          )}
        </section>

        <MeasurementsCard customer={c} defaultUnit={session.data?.studio?.measurementUnit ?? "INCH"} timeZone={timeZone} />
      </div>

      <section className="space-y-3" aria-labelledby="customer-orders">
        <h2 id="customer-orders" className="text-lg font-semibold">
          Orders
        </h2>
        {orders.isPending ? (
          <PageSkeleton rows={2} />
        ) : orders.error ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
        ) : orders.data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
            No orders for {c.name} yet.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {orders.data.items.map((o) => (
              <OrderListItem key={o.id} order={o} timeZone={timeZone} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MeasurementsCard({ customer, defaultUnit, timeZone }: { customer: CustomerDto; defaultUnit: MeasurementUnit; timeZone: string }) {
  const queryClient = useQueryClient();
  const profile = customer.measurementProfile;
  const [editing, setEditing] = useState(false);
  const [unit, setUnit] = useState<MeasurementUnit>(profile?.unit ?? defaultUnit);
  const [recordedOn, setRecordedOn] = useState(profile?.recordedOn ?? todayInZone(timeZone));
  const [takenBy, setTakenBy] = useState(profile?.takenBy ?? "");
  const [notes, setNotes] = useState(profile?.notes ?? "");
  const [values, setValues] = useState<MeasurementValue[]>(profile?.values ?? []);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setUnit(profile?.unit ?? defaultUnit);
    setRecordedOn(profile?.recordedOn ?? todayInZone(timeZone));
    setTakenBy(profile?.takenBy ?? "");
    setNotes(profile?.notes ?? "");
    setValues(profile?.values ?? []);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api<CustomerDto>(`/customers/${customer.id}/measurements`, {
        method: "PUT",
        body: { unit, recordedOn, takenBy, notes, values },
      });
      queryClient.setQueryData(qk.customer(customer.id), updated);
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditing(false);
      toast.success("Measurements saved");
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-white p-5" aria-labelledby="measurements">
      <div className="flex items-center justify-between gap-2">
        <h2 id="measurements" className="flex items-center gap-2 font-semibold">
          <Ruler className="size-4 text-muted-foreground" aria-hidden="true" /> Measurements
        </h2>
        {!editing ? (
          <Button variant={profile ? "ghost" : "default"} size="sm" onClick={startEdit}>
            {profile ? <Pencil /> : <Plus />} {profile ? "Edit" : "Record measurements"}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label>Unit</Label>
              <RadioGroup value={unit} onValueChange={(v) => setUnit(v as MeasurementUnit)} className="flex gap-4">
                {(["INCH", "CM"] as const).map((u) => (
                  <label key={u} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={u} /> {MEASUREMENT_UNIT_LABELS[u]}
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1">
              <Label htmlFor="recordedOn">Measured on</Label>
              <Input id="recordedOn" type="date" value={recordedOn} onChange={(e) => setRecordedOn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="takenBy">Taken by (optional)</Label>
              <Input id="takenBy" value={takenBy} onChange={(e) => setTakenBy(e.target.value)} />
            </div>
          </div>
          <MeasurementValuesEditor values={values} unit={unit} onChange={setValues} idPrefix="profile" />
          <div className="space-y-1">
            <Label htmlFor="mnotes">Notes (optional)</Label>
            <Input id="mnotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Prefers a relaxed waist" />
          </div>
          <Alert>
            <AlertDescription>
              Changing these measurements never changes a brief you have already shared or that the customer approved — each brief keeps
              its own copy.
            </AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving || values.length === 0}>
              {saving ? <Spinner /> : null} Save measurements
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : profile ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {MEASUREMENT_UNIT_LABELS[profile.unit]} · measured {formatCalendarDate(profile.recordedOn)}
            {profile.takenBy ? ` by ${profile.takenBy}` : ""}
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {profile.values.map((v) => (
              <div key={v.key} className="flex justify-between gap-2 border-b border-dashed border-border py-1 text-sm">
                <dt className="text-muted-foreground">{v.label}</dt>
                <dd className="font-medium tabular">
                  {v.value} {MEASUREMENT_UNIT_SHORT[profile.unit]}
                </dd>
              </div>
            ))}
          </dl>
          {profile.notes ? <p className="text-sm text-muted-foreground">{profile.notes}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No measurements recorded. Record them here, or agree a fitting date on an order&apos;s brief.
        </p>
      )}
    </section>
  );
}
