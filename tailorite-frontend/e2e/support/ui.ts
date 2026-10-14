import { devices, expect, type Browser, type Page } from "@playwright/test";

/** A separate phone browser for the customer (no studio cookies). */
export async function customerPhone(browser: Browser) {
  const context = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "Africa/Lagos", locale: "en-US" });
  return context.newPage();
}

/** Opens the share dialog on the brief workbench, creates the version and returns its link. */
export async function shareFromWorkbench(page: Page, expectedVersion: number) {
  await page.getByRole("button", { name: /^(Share for review|Share change for approval)$/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create version and link" }).click();
  await expect(dialog.getByText(new RegExp(`Version ${expectedVersion} is ready for`))).toBeVisible();
  const link = await dialog.getByLabel("Customer link").inputValue();
  expect(link).toMatch(/\/review\/[0-9a-f-]{36}#.{20,}/);
  await page.keyboard.press("Escape");
  return link;
}

export async function openReview(phone: Page, link: string) {
  await phone.goto(link);
  await expect(phone.getByRole("heading", { name: /^Hello / })).toBeVisible();
  // The token is moved out of the address bar as soon as the page has read it (also when the
  // same link is opened again in a tab that already shows it).
  await expect.poll(() => new URL(phone.url()).hash).toBe("");
}

export async function approveOnPhone(phone: Page, link: string, versionNumber: number, name = "Ada Okafor") {
  await openReview(phone, link);
  await phone.getByRole("button", { name: "Approve this version" }).click();
  const sheet = phone.getByRole("dialog");
  await sheet.getByLabel("Your name").fill(name);
  await sheet.getByRole("checkbox").check();
  await sheet.getByRole("button", { name: `Approve version ${versionNumber}` }).click();
  await expect(phone.getByText(new RegExp(`Version ${versionNumber} is approved and recorded`))).toBeVisible();
}

/** Value shown for a money summary item on the order page (e.g. "Balance due"). */
export function moneyValue(page: Page, label: string) {
  return page.locator("#payments dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");
}
