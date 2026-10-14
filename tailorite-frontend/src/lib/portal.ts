"use client";

import { api, isApiError } from "@/lib/api";
import type { PortalReviewDto } from "@/contracts/approvals";

// The link token lives in the URL fragment (#…), which browsers never send to servers or in
// Referer headers. It is read once, removed from the address bar, and kept only in memory so a
// screenshot, bookmark or shared tab does not carry it.
const tokens = new Map<string, string>();

/** Moves a token from the address bar into memory. Returns true when a new one was found. */
function readFragment(accessId: string): boolean {
  const fragment = window.location.hash.replace(/^#/, "");
  if (!fragment) return false;
  tokens.set(accessId, decodeURIComponent(fragment));
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  return true;
}

async function exchange(accessId: string): Promise<boolean> {
  const token = tokens.get(accessId);
  if (!token) return false;
  await api(`/portal/${accessId}/session`, { method: "POST", body: { token } });
  return true;
}

/** Opens (or reopens) the review: exchanges the link token for a short review session when needed. */
export async function loadReview(accessId: string): Promise<PortalReviewDto> {
  const fresh = readFragment(accessId);
  if (fresh) await exchange(accessId);
  try {
    return await api<PortalReviewDto>(`/portal/${accessId}/review`);
  } catch (error) {
    // The short review session may have ended while the page stayed open: renew it once.
    if (!fresh && isApiError(error, "PORTAL_SESSION_REQUIRED") && (await exchange(accessId))) {
      return api<PortalReviewDto>(`/portal/${accessId}/review`);
    }
    throw error;
  }
}

/** Sends a portal action, renewing an ended review session once if the token is still in memory. */
export async function portalPost(accessId: string, path: "decision" | "change-requests", body: unknown): Promise<PortalReviewDto> {
  try {
    return await api<PortalReviewDto>(`/portal/${accessId}/${path}`, { method: "POST", body });
  } catch (error) {
    if (isApiError(error, "PORTAL_SESSION_REQUIRED") && (await exchange(accessId))) {
      return api<PortalReviewDto>(`/portal/${accessId}/${path}`, { method: "POST", body });
    }
    throw error;
  }
}
