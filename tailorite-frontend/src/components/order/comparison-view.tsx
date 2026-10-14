import { ArrowRight, CalendarClock, Wallet } from "lucide-react";
import { formatCalendarDate, formatKobo } from "@/lib/format";
import type { VersionComparisonDto } from "@/contracts/approvals";
import { cn } from "@/lib/utils";

function signedKobo(kobo: number) {
  if (kobo === 0) return "No change";
  return `${kobo > 0 ? "+" : "−"}${formatKobo(Math.abs(kobo))}`;
}

function shift(days: number) {
  if (days === 0) return "Same date";
  return `${days > 0 ? `${days} day${days === 1 ? "" : "s"} later` : `${Math.abs(days)} day${days === -1 ? "" : "s"} earlier`}`;
}

/** Field-level comparison of the agreement in force and a proposed revision. */
export function ComparisonView({
  comparison,
  baseLabel,
  proposedLabel,
  compact = false,
}: {
  comparison: VersionComparisonDto;
  baseLabel?: string;
  proposedLabel?: string;
  compact?: boolean;
}) {
  const before = baseLabel ?? `Version ${comparison.baseVersionNumber} (approved)`;
  const after = proposedLabel ?? comparison.proposedLabel;
  const priceUp = (comparison.priceDifferenceKobo ?? 0) > 0;
  return (
    <div className="space-y-4">
      {comparison.reason ? (
        <p className="rounded-lg bg-canvas p-3 text-sm">
          <span className="font-medium">Reason for the change: </span>
          {comparison.reason}
        </p>
      ) : null}
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "md:grid-cols-2")}>
        <div className="rounded-lg border border-border p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wallet className="size-3.5" aria-hidden="true" /> Total price
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 tabular">
            <span className="text-muted-foreground line-through decoration-1">{formatKobo(comparison.before.totalPriceKobo)}</span>
            <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-lg font-semibold">{formatKobo(comparison.after.totalPriceKobo)}</span>
          </p>
          {comparison.priceDifferenceKobo !== null ? (
            <p className={cn("mt-1 text-sm font-medium", priceUp ? "text-coral-ink" : comparison.priceDifferenceKobo < 0 ? "text-teal-ink" : "text-muted-foreground")}>
              {signedKobo(comparison.priceDifferenceKobo)}
            </p>
          ) : null}
          {comparison.before.depositRequiredKobo !== comparison.after.depositRequiredKobo ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Deposit required: {formatKobo(comparison.before.depositRequiredKobo)} → {formatKobo(comparison.after.depositRequiredKobo)}
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarClock className="size-3.5" aria-hidden="true" /> Delivery date
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground line-through decoration-1">{formatCalendarDate(comparison.before.deliveryDate)}</span>
            <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-lg font-semibold">{formatCalendarDate(comparison.after.deliveryDate)}</span>
          </p>
          {comparison.deliveryShiftDays !== null ? (
            <p className={cn("mt-1 text-sm font-medium", comparison.deliveryShiftDays > 0 ? "text-coral-ink" : "text-muted-foreground")}>
              {shift(comparison.deliveryShiftDays)}
            </p>
          ) : null}
          {comparison.before.fittingDate !== comparison.after.fittingDate ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Fitting: {formatCalendarDate(comparison.before.fittingDate)} → {formatCalendarDate(comparison.after.fittingDate)}
            </p>
          ) : null}
        </div>
      </div>
      {/* Phones: one card per changed detail. Wider screens: a three-column table. */}
      <ul className={cn("space-y-2", compact ? "sm:hidden" : "md:hidden")} aria-label="Changed details">
        {comparison.fields.length === 0 ? (
          <li className="rounded-lg border border-border p-3 text-sm text-muted-foreground">No design details change — only the price or dates.</li>
        ) : (
          comparison.fields.map((f) => (
            <li key={f.key} className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">{f.label}</p>
              <div>
                <p className="text-xs text-muted-foreground">{before}</p>
                <p className="text-muted-foreground">{f.before}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{after}</p>
                <p className="font-semibold">{f.after}</p>
              </div>
            </li>
          ))
        )}
      </ul>
      <div className={cn("overflow-hidden rounded-lg border border-border", compact ? "hidden sm:block" : "hidden md:block")}>
        <table className="w-full text-sm">
          <caption className="sr-only">Changed details</caption>
          <thead className="bg-canvas text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Detail</th>
              <th scope="col" className="px-3 py-2 font-medium">{before}</th>
              <th scope="col" className="px-3 py-2 font-medium">{after}</th>
            </tr>
          </thead>
          <tbody>
            {comparison.fields.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-3 text-muted-foreground">
                  No design details change — only the price or dates.
                </td>
              </tr>
            ) : (
              comparison.fields.map((f) => (
                <tr key={f.key} className="border-t border-border align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {f.label}
                    <span className="block text-xs font-normal text-muted-foreground">{f.section}</span>
                  </th>
                  <td className="px-3 py-2 text-muted-foreground">{f.before}</td>
                  <td className="px-3 py-2 font-medium">{f.after}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
