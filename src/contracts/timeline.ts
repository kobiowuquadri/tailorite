// GENERATED FILE — do not edit. Source of truth: tailorite-backend/src/contracts.
// Run `pnpm contracts:sync` after changing the backend contracts.
export type TimelineEventDto = {
  id: string;
  type: string;
  summary: string;
  actorType: 'USER' | 'CUSTOMER' | 'SYSTEM';
  actorLabel: string | null;
  createdAt: string;
};

export type DemoSessionDto = { redirectTo: string };
