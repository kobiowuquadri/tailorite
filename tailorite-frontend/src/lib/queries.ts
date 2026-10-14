"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SessionDto } from "@/contracts/auth";
import type { AiStatusDto, StudioDto, UsageDto } from "@/contracts/studio";

/** Query keys in one place so mutations can invalidate exactly what changed. */
export const qk = {
  session: ["session"] as const,
  studio: ["studio"] as const,
  usage: ["usage"] as const,
  aiStatus: ["ai-status"] as const,
  dashboard: ["dashboard"] as const,
  orders: (params: Record<string, unknown>) => ["orders", params] as const,
  order: (id: string) => ["order", id] as const,
  brief: (id: string) => ["brief", id] as const,
  sources: (id: string) => ["sources", id] as const,
  extraction: (id: string) => ["extraction", id] as const,
  versions: (id: string) => ["versions", id] as const,
  version: (orderId: string, versionId: string) => ["version", orderId, versionId] as const,
  finance: (id: string) => ["finance", id] as const,
  timeline: (id: string) => ["timeline", id] as const,
  links: (id: string) => ["links", id] as const,
  changes: (id: string) => ["changes", id] as const,
  compare: (id: string) => ["compare", id] as const,
  customers: (params: Record<string, unknown>) => ["customers", params] as const,
  customer: (id: string) => ["customer", id] as const,
};

export function useSession() {
  return useQuery({
    queryKey: qk.session,
    queryFn: () => api<SessionDto>("/auth/session"),
    retry: false,
    staleTime: 60_000,
  });
}

export function useStudio() {
  return useQuery({ queryKey: qk.studio, queryFn: () => api<StudioDto>("/studio"), staleTime: 60_000 });
}

export function useAiStatus() {
  return useQuery({ queryKey: qk.aiStatus, queryFn: () => api<AiStatusDto>("/ai/status"), staleTime: 30_000 });
}

export function useUsage() {
  return useQuery({ queryKey: qk.usage, queryFn: () => api<UsageDto>("/studio/usage") });
}

/** Everything that can change when an order's agreement, sources or money change. */
export function invalidateOrder(queryClient: QueryClient, orderId: string) {
  const keys = [
    qk.order(orderId),
    qk.brief(orderId),
    qk.sources(orderId),
    qk.extraction(orderId),
    qk.versions(orderId),
    qk.finance(orderId),
    qk.timeline(orderId),
    qk.links(orderId),
    qk.changes(orderId),
    qk.compare(orderId),
    qk.dashboard,
    ["orders"],
    ["version", orderId],
    qk.usage,
  ];
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
