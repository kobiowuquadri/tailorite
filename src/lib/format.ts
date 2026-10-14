import { formatIsoDate, formatKobo } from "@/contracts/brief";

export { formatIsoDate, formatKobo };

/** Event timestamps are stored in UTC and shown in the studio's time zone. */
export function formatDateTime(iso: string | null | undefined, timeZone = "Africa/Lagos"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateShort(iso: string | null | undefined, timeZone = "Africa/Lagos"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

/** Calendar date (YYYY-MM-DD) formatted without shifting time zones. */
export function formatCalendarDate(iso: string | null | undefined, style: "long" | "short" = "long"): string {
  if (!iso) return "—";
  if (style === "long") return formatIsoDate(iso);
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function todayInZone(timeZone = "Africa/Lagos"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function relativeDays(dateIso: string | null, timeZone = "Africa/Lagos"): string | null {
  if (!dateIso) return null;
  const diff = daysBetween(todayInZone(timeZone), dateIso);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${Math.abs(diff)} days ago`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Naira amount typed by a person → integer kobo. Accepts "85,000" or "85000.50". */
export function nairaInputToKobo(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function koboToNairaInput(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined) return "";
  const naira = Math.trunc(kobo / 100);
  const rest = kobo % 100;
  return rest ? `${naira}.${String(rest).padStart(2, "0")}` : String(naira);
}
