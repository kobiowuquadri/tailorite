// Calendar dates (delivery/fitting dates) are date-only values ("YYYY-MM-DD") stored in
// PostgreSQL `date` columns. Prisma represents them as Date objects at UTC midnight.
// Event timestamps are stored in UTC and rendered in the studio's time zone by the client.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function dateOnlyToDb(iso: string): Date {
  if (!ISO_DATE.test(iso)) throw new Error(`Invalid date-only value: ${iso}`);
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dbToDateOnly(value: Date): string;
export function dbToDateOnly(value: Date | null | undefined): string | null;
export function dbToDateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Today's calendar date in a time zone, e.g. todayInZone('Africa/Lagos') → '2026-10-13'. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = dateOnlyToDb(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dbToDateOnly(d);
}

/** Whole calendar days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((dateOnlyToDb(b).getTime() - dateOnlyToDb(a).getTime()) / 86_400_000);
}

/** Offset (local − UTC) in milliseconds of `timeZone` at `instant`. */
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - instant.getTime();
}

/** UTC instant at which the given calendar date starts in `timeZone`. */
export function startOfDayUtc(timeZone: string, iso: string): Date {
  const guess = dateOnlyToDb(iso).getTime();
  const first = guess - zoneOffsetMs(timeZone, new Date(guess));
  // Second pass corrects for offset changes (DST) between the guess and the real instant.
  return new Date(guess - zoneOffsetMs(timeZone, new Date(first)));
}
