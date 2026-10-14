import { addDays, dateOnlyToDb, dbToDateOnly, diffDays, startOfDayUtc, todayInZone } from '../src/common/time/dates.js';
import { formatIsoDate } from '../src/contracts/brief.js';

describe('dates in Africa/Lagos', () => {
  it('uses the Lagos calendar day for "today", not the server’s UTC day', () => {
    // 23:30 UTC on 13 October is already 00:30 on 14 October in Lagos (UTC+1).
    expect(todayInZone('Africa/Lagos', new Date('2026-10-13T23:30:00Z'))).toBe('2026-10-14');
    expect(todayInZone('Africa/Lagos', new Date('2026-10-13T22:59:59Z'))).toBe('2026-10-13');
    expect(startOfDayUtc('Africa/Lagos', '2026-10-14').toISOString()).toBe('2026-10-13T23:00:00.000Z');
  });

  it('keeps delivery dates as calendar dates that never shift with time zones', () => {
    const stored = dateOnlyToDb('2026-11-03');
    expect(stored.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(dbToDateOnly(stored)).toBe('2026-11-03');
    expect(formatIsoDate('2026-11-03')).toBe('3 November 2026');
    // "Two calendar days later" for a change proposal, across a month boundary.
    expect(addDays('2026-11-03', 2)).toBe('2026-11-05');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(diffDays('2026-11-03', '2026-11-05')).toBe(2);
    expect(() => dateOnlyToDb('3/11/2026')).toThrow();
  });
});
