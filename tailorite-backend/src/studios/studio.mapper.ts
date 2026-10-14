import type { Studio } from '../generated/prisma/client.js';
import type { StudioDto } from '../contracts/studio.js';

export function toStudioDto(s: Studio): StudioDto {
  return {
    id: s.id,
    name: s.name,
    ownerName: s.ownerName,
    phone: s.phone,
    email: s.email,
    city: s.city,
    currency: 'USD',
    timeZone: s.timeZone,
    measurementUnit: s.measurementUnit,
    isDemo: s.isDemo,
    demoExpiresAt: s.demoExpiresAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
