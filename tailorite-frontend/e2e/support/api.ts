import { randomUUID } from "node:crypto";
import { request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";

// API shortcuts for setting up state quickly. Every journey still exercises the screens it is
// about through the browser; these only skip the steps another test already covers.

export const WEB = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const HEADERS = { "x-tailorite-csrf": "1", origin: WEB };

export type ShareLink = { accessId: string; url: string; expiresAt: string };
export type Published = { version: { id: string; number: number; contentHash: string }; link: ShareLink };

async function call<T>(api: APIRequestContext, method: "GET" | "POST" | "PUT", path: string, data?: unknown): Promise<T> {
  const res = await api.fetch(`${WEB}/api${path}`, { method, data, headers: HEADERS });
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()}: ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const get = <T>(api: APIRequestContext, path: string) => call<T>(api, "GET", path);
export const post = <T>(api: APIRequestContext, path: string, data?: unknown) => call<T>(api, "POST", path, data ?? {});
export const put = <T>(api: APIRequestContext, path: string, data: unknown) => call<T>(api, "PUT", path, data);

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

export function futureDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Signs a new owner into the page's browser context (cookies are shared with page.request). */
export async function signUpStudio(page: Page, studioName = "Test Atelier") {
  const api = page.request;
  await post(api, "/auth/register", { name: "Kemi Adebayo", email: uniqueEmail("owner"), password: "correct-horse-battery" });
  await post(api, "/studios", {
    studioName,
    ownerName: "Kemi Adebayo",
    phone: "08030000000",
    city: "Lagos",
    measurementUnit: "INCH",
    timeZone: "Africa/Lagos",
    currency: "NGN",
  });
  return api;
}

export async function createCustomer(api: APIRequestContext, name = "Ada Okafor") {
  return post<{ id: string; name: string }>(api, "/customers", { name, phone: "08031234567" });
}

export async function createOrder(api: APIRequestContext, customerId: string, title = "Navy evening dress", garmentType = "Dress") {
  return post<{ id: string; reference: string }>(api, "/orders", { customerId, title, garmentType });
}

type Field = { value: string | null; notApplicable: boolean; note: string | null; evidence: unknown[]; origin: "MANUAL" };
const field = (value: string | null): Field => ({ value, notApplicable: false, note: null, evidence: [], origin: "MANUAL" });

/** The demo scenario's confirmed V1 (₦85,000, deposit ₦30,000). */
export function completeBrief(overrides: { totalPriceKobo?: number; deliveryDate?: string; embellishments?: string } = {}) {
  return {
    schemaVersion: 1,
    fields: {
      garmentType: field("Floor-length dress"),
      overallStyle: field("Navy-blue floor-length evening dress"),
      neckline: field("Square neckline"),
      sleeves: field("Elbow length"),
      length: field("Floor length"),
      fit: field("Fitted bodice, relaxed skirt"),
      back: field(null),
      closure: field(null),
      lining: field(null),
      otherDetails: field(null),
      fabric: field("Customer-supplied navy crepe"),
      color: field("Navy blue"),
      embellishments: field(overrides.embellishments ?? "Light beading around the neckline"),
      specialRequests: field(null),
    },
    fabricSupplier: "CUSTOMER",
    fabricSupplierNote: null,
    exclusions: [{ id: "noslit", text: "No slit", evidence: [], origin: "MANUAL" }],
    references: [],
    measurements: {
      mode: "MEASURED",
      unit: "INCH",
      values: [
        { key: "bust", label: "Bust", value: 36 },
        { key: "waist", label: "Waist", value: 29 },
        { key: "hips", label: "Hips", value: 40 },
      ],
      recordedOn: futureDate(-3),
      fittingNote: null,
      notNeededReason: null,
    },
    terms: {
      totalPriceKobo: overrides.totalPriceKobo ?? 8_500_000,
      depositRequiredKobo: 3_000_000,
      deliveryDate: overrides.deliveryDate ?? futureDate(21),
      fittingDate: null,
      paymentNote: "Deposit before cutting; balance on collection.",
    },
    customerNotes: null,
  };
}

export async function saveBrief(api: APIRequestContext, orderId: string, content: unknown) {
  const brief = await get<{ revision: number }>(api, `/orders/${orderId}/brief`);
  return put(api, `/orders/${orderId}/brief`, { expectedRevision: brief.revision, content, internalNotes: null });
}

export async function publish(api: APIRequestContext, orderId: string): Promise<Published> {
  const brief = await get<{ revision: number }>(api, `/orders/${orderId}/brief`);
  return post<Published>(api, `/orders/${orderId}/versions`, { expectedRevision: brief.revision, idempotencyKey: randomUUID() });
}

/** A studio with Ada's order published as V1 and (optionally) approved through the portal API. */
export async function publishedOrder(page: Page, opts: { approve?: boolean } = {}) {
  const api = await signUpStudio(page);
  const customer = await createCustomer(api);
  const order = await createOrder(api, customer.id);
  await saveBrief(api, order.id, completeBrief());
  const published = await publish(api, order.id);
  if (opts.approve) await approveThroughPortal(published.link, "Ada Okafor");
  return { api, orderId: order.id, customerId: customer.id, ...published };
}

/** A separate cookie jar acting as the customer's phone browser, using the portal API. */
export async function approveThroughPortal(link: ShareLink, name: string) {
  const customer = await playwrightRequest.newContext({ baseURL: WEB, extraHTTPHeaders: HEADERS });
  try {
    const [path, token] = link.url.split("#");
    const accessId = path.split("/review/")[1];
    await post(customer, `/portal/${accessId}/session`, { token });
    const review = await get<{ version: { contentHash: string } }>(customer, `/portal/${accessId}/review`);
    await post(customer, `/portal/${accessId}/decision`, {
      decision: "APPROVE",
      name,
      confirmed: true,
      contentHash: review.version.contentHash,
    });
  } finally {
    await customer.dispose();
  }
}
