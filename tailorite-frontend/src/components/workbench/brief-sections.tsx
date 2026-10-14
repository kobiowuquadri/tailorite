"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { MeasurementValuesEditor } from "@/components/customers/measurement-editor";
import { BriefSection, FieldEditor } from "@/components/workbench/field-editor";
import { EvidenceChips } from "@/components/workbench/evidence";
import { MoneyInput } from "@/components/workbench/money-input";
import type { BriefEditor } from "@/components/workbench/use-brief-editor";
import { api } from "@/lib/api";
import { toastError } from "@/lib/form-errors";
import { formatMoney } from "@/lib/format";
import {
  FABRIC_SUPPLIER_LABELS,
  FIELD_DEFS,
  MEASUREMENT_MODE_LABELS,
  type BriefContent,
  type BriefDto,
  type FabricSupplier,
  type MeasurementMode,
  type ReadinessItem,
  type TextFieldKey,
} from "@/contracts/brief";
import { MEASUREMENT_UNIT_LABELS, type MeasurementUnit } from "@/contracts/studio";
import type { SourceDto } from "@/contracts/sources";

type SectionProps = {
  editor: BriefEditor;
  disabled: boolean;
  problems: Map<string, string>;
};

function fieldsOf(section: string) {
  return FIELD_DEFS.filter((d) => d.section === section);
}

function TextFields({ keys, editor, disabled, problems }: SectionProps & { keys: TextFieldKey[] }) {
  return (
    <div className="space-y-5">
      {keys.map((key) => (
        <FieldEditor
          key={key}
          fieldKey={key}
          field={editor.content.fields[key]}
          disabled={disabled}
          problem={problems.get(key)}
          onChange={(next) => editor.update((c) => ({ ...c, fields: { ...c.fields, [key]: next } }))}
        />
      ))}
    </div>
  );
}

export function GarmentSection(props: SectionProps & { customerName: string }) {
  return (
    <BriefSection id="section-garment" title="Customer and garment">
      <p className="text-sm">
        <span className="text-muted-foreground">Customer:</span> <span className="font-medium">{props.customerName}</span>
      </p>
      <TextFields {...props} keys={fieldsOf("garment").map((d) => d.key)} />
    </BriefSection>
  );
}

export function DesignSection(props: SectionProps) {
  return (
    <BriefSection
      id="section-design"
      title="Design details"
      description="Required details need a value or an explicit “Not applicable”. Leave optional ones empty if they were not discussed."
    >
      <TextFields {...props} keys={fieldsOf("design").map((d) => d.key)} />
    </BriefSection>
  );
}

export function FabricSection(props: SectionProps) {
  const { editor, disabled, problems } = props;
  const content = editor.content;
  return (
    <BriefSection id="section-fabric" title="Fabric and colour">
      <TextFields {...props} keys={fieldsOf("fabric").map((d) => d.key)} />
      {!content.fields.fabric.notApplicable ? (
        <div className="space-y-2">
          <Label>Who supplies the fabric? *</Label>
          <RadioGroup
            value={content.fabricSupplier ?? ""}
            onValueChange={(v) => editor.update((c) => ({ ...c, fabricSupplier: v as FabricSupplier }))}
            className="grid gap-2 sm:grid-cols-2"
            disabled={disabled}
            aria-invalid={problems.has("fabricSupplier")}
          >
            {(["CUSTOMER", "STUDIO"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm has-data-[state=checked]:border-primary/40 has-data-[state=checked]:bg-blue-tint/50">
                <RadioGroupItem value={s} /> {FABRIC_SUPPLIER_LABELS[s]}
              </label>
            ))}
          </RadioGroup>
          {problems.get("fabricSupplier") ? <p className="text-xs text-destructive">{problems.get("fabricSupplier")}</p> : null}
          <Input
            aria-label="Fabric supply note"
            placeholder="Optional note, e.g. Customer brings 4 yards by 20 Oct"
            value={content.fabricSupplierNote ?? ""}
            disabled={disabled}
            onChange={(e) => editor.update((c) => ({ ...c, fabricSupplierNote: e.target.value || null }))}
          />
        </div>
      ) : null}
    </BriefSection>
  );
}

export function ExtrasSection(props: SectionProps) {
  return (
    <BriefSection id="section-extras" title="Embellishments and special requests">
      <TextFields {...props} keys={fieldsOf("extras").map((d) => d.key)} />
    </BriefSection>
  );
}

export function ExclusionsSection({ editor, disabled }: SectionProps) {
  const [text, setText] = useState("");
  const add = () => {
    const value = text.trim();
    if (!value) return;
    editor.update((c) => ({
      ...c,
      exclusions: [...c.exclusions, { id: crypto.randomUUID().slice(0, 8), text: value, evidence: [], origin: "MANUAL" }],
    }));
    setText("");
  };
  return (
    <BriefSection
      id="section-exclusions"
      title="Explicitly excluded"
      description="Things the customer does not want, e.g. “No slit”. These are shown to the customer as part of the agreement."
    >
      {editor.content.exclusions.length ? (
        <ul className="space-y-2">
          {editor.content.exclusions.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-2.5">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{e.text}</p>
                <EvidenceChips evidence={e.evidence} />
              </div>
              {!disabled ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove “${e.text}”`}
                  onClick={() => editor.update((c) => ({ ...c, exclusions: c.exclusions.filter((x) => x.id !== e.id) }))}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing excluded yet.</p>
      )}
      {!disabled ? (
        <div className="flex gap-2">
          <Input
            aria-label="Add an exclusion"
            placeholder="e.g. No slit"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={add} disabled={!text.trim()}>
            <Plus /> Add
          </Button>
        </div>
      ) : null}
    </BriefSection>
  );
}

export function ReferencesSection({ editor, disabled, images }: SectionProps & { images: SourceDto[] }) {
  const selected = new Map(editor.content.references.map((r) => [r.sourceId, r]));
  return (
    <BriefSection
      id="section-references"
      title="Selected references"
      description="Only the pictures you select here are shown to the customer. Say what to take from each one."
    >
      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reference images on this order yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {images.map((img) => {
            const ref = selected.get(img.id);
            return (
              <li key={img.id} className="space-y-2 rounded-lg border border-border p-2.5">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={Boolean(ref)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      editor.update((c) => ({
                        ...c,
                        references:
                          checked === true
                            ? [...c.references, { sourceId: img.id, note: null }]
                            : c.references.filter((r) => r.sourceId !== img.id),
                      }))
                    }
                  />
                  Show “{img.label}” to the customer
                </label>
                {img.previewUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- private, authorized API image */
                  <img src={img.previewUrl} alt={img.label} loading="lazy" className="h-28 w-full rounded-md bg-canvas object-contain" />
                ) : null}
                {ref ? (
                  <Input
                    aria-label={`What to take from ${img.label}`}
                    placeholder="e.g. Neckline shape only — no slit"
                    value={ref.note ?? ""}
                    disabled={disabled}
                    onChange={(e) =>
                      editor.update((c) => ({
                        ...c,
                        references: c.references.map((r) => (r.sourceId === img.id ? { ...r, note: e.target.value || null } : r)),
                      }))
                    }
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </BriefSection>
  );
}

export function MeasurementsSection({
  editor,
  disabled,
  problems,
  brief,
  orderId,
}: SectionProps & { brief: BriefDto; orderId: string }) {
  const m = editor.content.measurements;
  const [copying, setCopying] = useState(false);
  const setM = (patch: Partial<BriefContent["measurements"]>) => editor.update((c) => ({ ...c, measurements: { ...c.measurements, ...patch } }));

  async function copyFromProfile() {
    setCopying(true);
    try {
      await editor.runAction((expectedRevision) =>
        api<BriefDto>(`/orders/${orderId}/brief/measurements/copy`, { method: "POST", body: { expectedRevision, keys: [] } }),
      );
      toast.success("Measurements copied into this brief");
    } catch (error) {
      toastError(error);
    } finally {
      setCopying(false);
    }
  }

  return (
    <BriefSection
      id="section-measurements"
      title="Measurements"
      description="Record the measurements this garment needs, agree a fitting, or explain why none are needed."
    >
      <RadioGroup
        value={m.mode ?? ""}
        onValueChange={(v) => setM({ mode: v as MeasurementMode })}
        className="grid gap-2 sm:grid-cols-3"
        disabled={disabled}
      >
        {(["MEASURED", "AT_FITTING", "NOT_NEEDED"] as const).map((mode) => (
          <label key={mode} className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm has-data-[state=checked]:border-primary/40 has-data-[state=checked]:bg-blue-tint/50">
            <RadioGroupItem value={mode} /> {MEASUREMENT_MODE_LABELS[mode]}
          </label>
        ))}
      </RadioGroup>
      {problems.get("measurements") ? <p className="text-xs text-destructive">{problems.get("measurements")}</p> : null}

      {m.mode === "MEASURED" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Unit</Label>
              <RadioGroup value={m.unit ?? ""} onValueChange={(v) => setM({ unit: v as MeasurementUnit })} className="flex gap-4" disabled={disabled}>
                {(["INCH", "CM"] as const).map((u) => (
                  <label key={u} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={u} /> {MEASUREMENT_UNIT_LABELS[u]}
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1">
              <Label htmlFor="measured-on">Measured on</Label>
              <Input id="measured-on" type="date" value={m.recordedOn ?? ""} disabled={disabled} onChange={(e) => setM({ recordedOn: e.target.value || null })} />
            </div>
            {brief.customer.hasMeasurements && !disabled ? (
              <Button type="button" variant="outline" onClick={copyFromProfile} disabled={copying}>
                {copying ? <Spinner /> : <Copy />} Copy from {brief.customer.name}&apos;s profile
              </Button>
            ) : null}
          </div>
          <MeasurementValuesEditor values={m.values} unit={m.unit} onChange={(values) => setM({ values })} disabled={disabled} idPrefix="brief" />
          <Alert>
            <AlertDescription>
              These values are copied into the agreement when you share it. Later edits to the customer profile never change a shared or
              approved version.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {m.mode === "AT_FITTING" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="fitting-date">Agreed fitting date *</Label>
            <Input
              id="fitting-date"
              type="date"
              value={editor.content.terms.fittingDate ?? ""}
              disabled={disabled}
              aria-invalid={problems.has("fittingDate")}
              onChange={(e) => editor.update((c) => ({ ...c, terms: { ...c.terms, fittingDate: e.target.value || null } }))}
            />
            {problems.get("fittingDate") ? <p className="text-xs text-destructive">{problems.get("fittingDate")}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="fitting-note">Fitting note</Label>
            <Input
              id="fitting-note"
              placeholder="e.g. Bring the shoes you will wear"
              value={m.fittingNote ?? ""}
              disabled={disabled}
              onChange={(e) => setM({ fittingNote: e.target.value || null })}
            />
          </div>
        </div>
      ) : null}

      {m.mode === "NOT_NEEDED" ? (
        <div className="space-y-1">
          <Label htmlFor="not-needed">Why measurements are not needed *</Label>
          <Input
            id="not-needed"
            placeholder="e.g. Free-size kaftan"
            value={m.notNeededReason ?? ""}
            disabled={disabled}
            onChange={(e) => setM({ notNeededReason: e.target.value || null })}
          />
        </div>
      ) : null}
    </BriefSection>
  );
}

export function TermsSection({ editor, disabled, problems }: SectionProps) {
  const t = editor.content.terms;
  const setT = (patch: Partial<BriefContent["terms"]>) => editor.update((c) => ({ ...c, terms: { ...c.terms, ...patch } }));
  return (
    <BriefSection
      id="section-terms"
      title="Price and dates"
      description="Proposed terms. Nothing is agreed until the customer approves this version."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="total-price">Quoted total price *</Label>
          <MoneyInput id="total-price" valueKobo={t.totalPriceKobo} onChange={(v) => setT({ totalPriceKobo: v })} disabled={disabled} invalid={problems.has("totalPrice")} />
          {problems.get("totalPrice") ? <p className="text-xs text-destructive">{problems.get("totalPrice")}</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="deposit">Deposit required *</Label>
          <MoneyInput id="deposit" valueKobo={t.depositRequiredKobo} onChange={(v) => setT({ depositRequiredKobo: v })} disabled={disabled} invalid={problems.has("depositRequired")} />
          {problems.get("depositRequired") ? <p className="text-xs text-destructive">{problems.get("depositRequired")}</p> : null}
          {t.totalPriceKobo && t.depositRequiredKobo !== null && t.depositRequiredKobo <= t.totalPriceKobo ? (
            <p className="text-xs text-muted-foreground">Balance on delivery: {formatMoney(t.totalPriceKobo - t.depositRequiredKobo)}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="delivery-date">Delivery date *</Label>
          <Input id="delivery-date" type="date" value={t.deliveryDate ?? ""} disabled={disabled} aria-invalid={problems.has("deliveryDate")} onChange={(e) => setT({ deliveryDate: e.target.value || null })} />
          {problems.get("deliveryDate") ? <p className="text-xs text-destructive">{problems.get("deliveryDate")}</p> : null}
        </div>
        {editor.content.measurements.mode !== "AT_FITTING" ? (
          <div className="space-y-1">
            <Label htmlFor="fitting-date-terms">Fitting date (optional)</Label>
            <Input id="fitting-date-terms" type="date" value={t.fittingDate ?? ""} disabled={disabled} onChange={(e) => setT({ fittingDate: e.target.value || null })} />
          </div>
        ) : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="payment-note">Payment terms note (optional)</Label>
        <Input
          id="payment-note"
          placeholder="e.g. Deposit before cutting; balance on collection"
          value={t.paymentNote ?? ""}
          disabled={disabled}
          onChange={(e) => setT({ paymentNote: e.target.value || null })}
        />
      </div>
    </BriefSection>
  );
}

export function NotesSection({ editor, disabled }: SectionProps) {
  return (
    <BriefSection id="section-notes" title="Notes">
      <div className="space-y-1">
        <Label htmlFor="customer-notes">Notes the customer should review (optional)</Label>
        <Textarea
          id="customer-notes"
          rows={3}
          value={editor.content.customerNotes ?? ""}
          disabled={disabled}
          onChange={(e) => editor.update((c) => ({ ...c, customerNotes: e.target.value || null }))}
        />
      </div>
      <div className="space-y-1 rounded-lg bg-canvas p-3">
        <Label htmlFor="internal-notes">Studio-only notes</Label>
        <Textarea
          id="internal-notes"
          rows={3}
          value={editor.internalNotes ?? ""}
          disabled={disabled}
          onChange={(e) => editor.updateNotes(e.target.value)}
          className="bg-white"
        />
        <p className="text-xs text-muted-foreground">Never shown to the customer and never copied into an agreement version.</p>
      </div>
    </BriefSection>
  );
}

/** Maps readiness items to the inline field they concern. */
export function problemsFrom(items: ReadinessItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.code === "OPEN_ISSUE") continue;
    if (item.field) map.set(item.field, item.message);
    else if (item.section === "measurements") map.set("measurements", item.message);
  }
  return map;
}
