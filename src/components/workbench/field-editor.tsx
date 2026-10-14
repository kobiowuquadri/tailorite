"use client";

import { Sparkles, PencilLine, MessageCircleQuestion } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EvidenceChips } from "@/components/workbench/evidence";
import { FIELD_DEF_BY_KEY, type BriefField, type TextFieldKey } from "@/contracts/brief";
import { cn } from "@/lib/utils";

const ORIGIN: Record<BriefField["origin"], { label: string; icon: typeof Sparkles } | null> = {
  MANUAL: null,
  AI_ACCEPTED: { label: "From a suggestion you accepted", icon: Sparkles },
  AI_EDITED: { label: "Suggestion, edited by you", icon: PencilLine },
  CLARIFICATION: { label: "Confirmed while resolving a question", icon: MessageCircleQuestion },
};

export function FieldEditor({
  fieldKey,
  field,
  onChange,
  disabled,
  problem,
  multiline = true,
}: {
  fieldKey: TextFieldKey;
  field: BriefField;
  onChange: (next: BriefField) => void;
  disabled?: boolean;
  problem?: string;
  multiline?: boolean;
}) {
  const def = FIELD_DEF_BY_KEY[fieldKey];
  const id = `field-${fieldKey}`;
  const origin = ORIGIN[field.origin];
  const set = (patch: Partial<BriefField>) => onChange({ ...field, ...patch });

  return (
    <div className="space-y-1.5" data-field={fieldKey}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {def.label}
          {def.required ? <span className="text-muted-foreground"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
        </Label>
        {def.allowNotApplicable ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={field.notApplicable}
              disabled={disabled}
              onCheckedChange={(checked) =>
                set(checked === true ? { notApplicable: true, value: null, origin: "MANUAL" } : { notApplicable: false })
              }
              aria-label={`${def.label} not applicable`}
            />
            Not applicable
          </label>
        ) : null}
      </div>
      {field.notApplicable ? (
        <Input
          aria-label={`Why ${def.label.toLowerCase()} is not applicable`}
          placeholder="Optional context, e.g. Sleeveless gown"
          value={field.note ?? ""}
          disabled={disabled}
          onChange={(e) => set({ note: e.target.value || null })}
        />
      ) : multiline ? (
        <Textarea
          id={id}
          rows={2}
          value={field.value ?? ""}
          placeholder={def.placeholder}
          disabled={disabled}
          aria-invalid={Boolean(problem)}
          onChange={(e) =>
            set({ value: e.target.value || null, origin: field.origin === "AI_ACCEPTED" ? "AI_EDITED" : field.origin })
          }
          className="min-h-10 resize-y"
        />
      ) : (
        <Input
          id={id}
          value={field.value ?? ""}
          placeholder={def.placeholder}
          disabled={disabled}
          aria-invalid={Boolean(problem)}
          onChange={(e) =>
            set({ value: e.target.value || null, origin: field.origin === "AI_ACCEPTED" ? "AI_EDITED" : field.origin })
          }
        />
      )}
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
      <div className={cn("flex flex-wrap items-center gap-2", !origin && !field.evidence.length && "hidden")}>
        {origin ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <origin.icon className="size-3" aria-hidden="true" /> {origin.label}
          </span>
        ) : null}
        <EvidenceChips evidence={field.evidence} />
      </div>
    </div>
  );
}

export function BriefSection({
  id,
  title,
  description,
  children,
  aside,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4 rounded-xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`${id}-title`} className="font-semibold">
            {title}
          </h3>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
