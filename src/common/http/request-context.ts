import type { Request } from 'express';

export type AuthContext = {
  userId: string;
  userName: string;
  sessionId: string;
  studioId: string | null;
  role: 'OWNER' | 'STAFF' | null;
  isDemoUser: boolean;
};

/** Express request augmented by Tailorite middleware/guards. */
export type AppRequest = Request & {
  requestId: string;
  startedAt: number;
  auth?: AuthContext;
};

export function requestIdOf(req: unknown): string {
  return (req as Partial<AppRequest> | undefined)?.requestId ?? 'unknown';
}
