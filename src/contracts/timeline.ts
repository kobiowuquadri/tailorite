export type TimelineEventDto = {
  id: string;
  type: string;
  summary: string;
  actorType: 'USER' | 'CUSTOMER' | 'SYSTEM';
  actorLabel: string | null;
  createdAt: string;
};

export type DemoSessionDto = { redirectTo: string };
