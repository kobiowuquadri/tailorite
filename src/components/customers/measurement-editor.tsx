"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMMON_MEASUREMENTS, type MeasurementValue } from "@/contracts/customers";
import { MEASUREMENT_UNIT_SHORT, type MeasurementUnit } from "@/contracts/studio";

const COMMON_KEYS = new Set<string>(COMMON_MEASUREMENTS.map((m) => m.key));
const COMMON_ORDER = new Map<string, number>(COMMON_MEASUREMENTS.map((m, i) => [m.key, i]));

export function customKeyFor(label: string, taken: Set<string>): string {
  const words = label
    .normalize("NFKD")
    .replace(/[^\w\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  const camel = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
  const base = `custom_${camel || "measurement"}`.slice(0, 44);
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base.slice(0, 41)}_${n++}`;
  return key;
}

function UnitInput({
  id,
  label,
  value,
  unitLabel,
  disabled,
  onChange,
  className,
}: {
  id?: string;
  label: string;
  value: string;
  unitLabel: string;
  disabled?: boolean;
  onChange: (raw: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <Input
        id={id}
        aria-label={id ? undefined : label}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10 tabular"
        placeholder="—"
      />
      {unitLabel ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {unitLabel}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Measurement values entered by a person. Common fields are optional — fill only what this
 * garment needs — and custom labels are allowed. Values are numbers in the chosen unit.
 */
export function MeasurementValuesEditor({
  values,
  unit,
  onChange,
  disabled,
  idPrefix = "m",
}: {
  values: MeasurementValue[];
  unit: MeasurementUnit | null;
  onChange: (values: MeasurementValue[]) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  // Raw text per key so partially typed numbers ("36.") are not lost between renders.
  const [raw, setRaw] = useState<Record<string, string>>({});
  // Custom rows added in this session that do not have a value yet.
  const [pending, setPending] = useState<{ key: string; label: string }[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const unitLabel = unit ? MEASUREMENT_UNIT_SHORT[unit] : "";

  const textFor = (key: string) => {
    if (key in raw) return raw[key];
    const v = values.find((x) => x.key === key);
    return v ? String(v.value) : "";
  };

  function update(key: string, label: string, text: string) {
    setRaw((r) => ({ ...r, [key]: text }));
    const num = Number(text.replace(",", "."));
    const rest = values.filter((v) => v.key !== key);
    if (text.trim() === "" || !Number.isFinite(num) || num <= 0) {
      onChange(rest);
      return;
    }
    const next = [...rest, { key, label, value: Math.round(num * 100) / 100 }];
    next.sort((a, b) => (COMMON_ORDER.get(a.key) ?? 100) - (COMMON_ORDER.get(b.key) ?? 100));
    onChange(next);
  }

  function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    const taken = new Set([...values.map((v) => v.key), ...pending.map((p) => p.key)]);
    setPending((p) => [...p, { key: customKeyFor(label, taken), label }]);
    setNewLabel("");
  }

  function removeCustom(key: string) {
    setPending((p) => p.filter((x) => x.key !== key));
    setRaw((r) => {
      const next = { ...r };
      delete next[key];
      return next;
    });
    onChange(values.filter((v) => v.key !== key));
  }

  const customRows = [
    ...values.filter((v) => !COMMON_KEYS.has(v.key)).map((v) => ({ key: v.key, label: v.label })),
    ...pending.filter((p) => !values.some((v) => v.key === p.key)),
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {COMMON_MEASUREMENTS.map((m) => (
          <div key={m.key} className="space-y-1">
            <Label htmlFor={`${idPrefix}-${m.key}`} className="text-xs font-medium text-muted-foreground">
              {m.label}
            </Label>
            <UnitInput
              id={`${idPrefix}-${m.key}`}
              label={m.label}
              value={textFor(m.key)}
              unitLabel={unitLabel}
              disabled={disabled}
              onChange={(text) => update(m.key, m.label, text)}
            />
          </div>
        ))}
      </div>

      {customRows.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Custom measurements</p>
          {customRows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-sm">{row.label}</span>
              <UnitInput
                label={row.label}
                value={textFor(row.key)}
                unitLabel={unitLabel}
                disabled={disabled}
                onChange={(text) => update(row.key, row.label, text)}
                className="w-32"
              />
              {!disabled ? (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${row.label}`} onClick={() => removeCustom(row.key)}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {!disabled ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-new-label`} className="text-xs font-medium text-muted-foreground">
              Add a custom measurement
            </Label>
            <Input
              id={`${idPrefix}-new-label`}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Agbada sleeve opening"
              className="w-64"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
          </div>
          <Button type="button" variant="outline" onClick={addCustom} disabled={!newLabel.trim()}>
            <Plus /> Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
