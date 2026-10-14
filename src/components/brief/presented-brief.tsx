import { cn } from "@/lib/utils";
import type { PresentedRow, PresentedSection } from "@/contracts/brief";

/** Measurement rows that describe the plan rather than a body measurement. */
const MEASUREMENT_INFO_KEYS = new Set(["measurements.mode", "measurements.recordedOn", "measurements.fittingDate"]);

export type PresentedReference = {
  id: string;
  label: string;
  note: string | null;
  url: string;
  width: number | null;
  height: number | null;
};

/**
 * Customer-facing rendering of an agreement (sections come from presentBrief on the server, so
 * they never contain evidence, internal notes or source conversations).
 */
export function PresentedBrief({
  sections,
  references = [],
  omit = [],
  changedKeys,
  variant = "screen",
}: {
  sections: PresentedSection[];
  references?: PresentedReference[];
  omit?: string[];
  changedKeys?: Set<string>;
  variant?: "screen" | "print";
}) {
  const visible = sections.filter((s) => !omit.includes(s.key));
  const print = variant === "print";
  const referenceSection =
    references.length > 0 ? (
      <section className={cn("break-inside-avoid", print ? "space-y-2" : "space-y-3")} aria-labelledby="refs-title">
        <h3 id="refs-title" className={cn("font-semibold", print ? "text-sm uppercase tracking-wide text-[#3d4757]" : "text-base")}>
          Selected references
        </h3>
        <ul className={cn("grid gap-3", print ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
          {references.map((r) => (
            <li key={r.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- authorized private media, not optimizable */}
              <img
                src={r.url}
                alt={r.note ? `${r.label}: ${r.note}` : r.label}
                width={r.width ?? undefined}
                height={r.height ?? undefined}
                loading="lazy"
                className={cn("w-full rounded-lg border border-border bg-canvas object-cover", print ? "aspect-square" : "aspect-[4/5]")}
              />
              <p className="text-xs font-medium">{r.label}</p>
              {changedKeys?.has(`reference.${r.id}`) ? <ChangedPill /> : null}
              {r.note ? <p className="text-xs text-muted-foreground">{r.note}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className={cn(print ? "space-y-5" : "space-y-6")}>
      {visible.map((section) => (
        <section key={section.key} className="break-inside-avoid space-y-2" aria-labelledby={`sec-${section.key}`}>
          <h3
            id={`sec-${section.key}`}
            className={cn("font-semibold", print ? "text-sm uppercase tracking-wide text-[#3d4757]" : "text-base")}
          >
            {section.title}
          </h3>
          <dl className={cn("divide-y divide-border", print ? "border-y border-border" : "rounded-lg border border-border")}>
            {(section.key === "measurements" ? section.rows.filter((r) => MEASUREMENT_INFO_KEYS.has(r.key)) : section.rows).map((row) => {
              const changed = changedKeys?.has(row.key);
              return (
                <div
                  key={row.key}
                  className={cn(
                    "grid gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4",
                    print ? "py-1.5" : "px-3 py-2.5",
                    changed && !print && "bg-coral-tint/40",
                  )}
                >
                  <dt className="text-sm text-muted-foreground">
                    {row.label}
                    {changed ? <ChangedPill /> : null}
                  </dt>
                  <dd className={cn("text-sm", row.empty || row.notApplicable ? "text-muted-foreground" : "font-medium text-foreground")}>
                    <span className="whitespace-pre-wrap">{row.value}</span>
                    {row.note ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{row.note}</span> : null}
                  </dd>
                </div>
              );
            })}
          </dl>
          {section.key === "measurements" ? (
            <MeasurementGrid rows={section.rows.filter((r) => !MEASUREMENT_INFO_KEYS.has(r.key))} changedKeys={changedKeys} print={print} />
          ) : null}
          {section.key === "design" ? referenceSection : null}
        </section>
      ))}
      {visible.every((s) => s.key !== "design") ? referenceSection : null}
    </div>
  );
}

/** Body measurements as a compact grid: readable on a phone and short on paper. */
function MeasurementGrid({ rows, changedKeys, print }: { rows: PresentedRow[]; changedKeys?: Set<string>; print: boolean }) {
  if (rows.length === 0) return null;
  return (
    <dl className={cn("grid gap-2", print ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
      {rows.map((row) => (
        <div
          key={row.key}
          className={cn(
            "rounded-lg border border-border px-3 py-2",
            print && "rounded-none border-x-0 border-t-0 px-0 py-1",
            changedKeys?.has(row.key) && !print && "bg-coral-tint/40",
          )}
        >
          <dt className="text-xs text-muted-foreground">
            {row.label}
            {changedKeys?.has(row.key) ? <ChangedPill /> : null}
          </dt>
          <dd className="text-sm font-semibold tabular">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ChangedPill() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-coral-tint px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-coral-ink uppercase">
      Changed
    </span>
  );
}
