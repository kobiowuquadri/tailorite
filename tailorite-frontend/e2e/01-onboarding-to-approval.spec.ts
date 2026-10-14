import { expect, test } from "@playwright/test";
import { futureDate, uniqueEmail } from "./support/api";
import { approveOnPhone, customerPhone, shareFromWorkbench } from "./support/ui";

test("a new owner records an order by hand, shares it, and the customer approves it on a phone", async ({ page, browser }) => {
  // Sign up and set up the studio.
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Kemi Adebayo");
  await page.getByLabel("Email").fill(uniqueEmail("onboarding"));
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Studio name").fill("Kemi Couture");
  await page.getByRole("radio", { name: "Inches" }).click();
  await page.getByRole("button", { name: "Create studio" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Kemi Couture").first()).toBeVisible();

  // Customer.
  await page.goto("/customers/new");
  await page.getByLabel("Full name").fill("Bola Martins");
  await page.getByLabel("Phone (optional)").fill("0803 555 0000");
  await page.getByRole("button", { name: "Save customer" }).click();
  await expect(page.getByRole("heading", { name: "Bola Martins" })).toBeVisible();

  // Manual order (no AI).
  await page.locator('main a[href^="/orders/new?customerId="]').click();
  await page.waitForURL(/\/orders\/new\?customerId=/);
  await expect(page.getByText("Bola Martins").first()).toBeVisible();
  await page.getByLabel("Order title").fill("Wedding agbada");
  await page.getByLabel("Garment type").fill("Agbada");
  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}\/brief$/);

  const fields: Record<string, string> = {
    garmentType: "Three-piece agbada",
    overallStyle: "Classic three-piece agbada with embroidered neckline",
    neckline: "Round neckline with gold embroidery",
    sleeves: "Wide agbada sleeves",
    length: "Ankle length",
    fit: "Relaxed fit",
    fabric: "Cream aso-oke",
    color: "Cream with gold thread",
  };
  for (const [key, value] of Object.entries(fields)) await page.locator(`#field-${key}`).fill(value);
  await page.getByRole("radio", { name: "Studio sources the fabric" }).click();
  await page.getByRole("radio", { name: "Measurements not needed" }).click();
  await page.locator("#not-needed").fill("Customer brings a well-fitting agbada to copy");
  await page.locator("#total-price").fill("1200");
  await page.locator("#deposit").fill("500");
  await page.locator("#delivery-date").fill(futureDate(30));
  await expect(page.getByText("Ready for customer review").first()).toBeVisible();

  const link = await shareFromWorkbench(page, 1);
  const orderUrl = page.url().replace(/\/brief$/, "");

  // The customer approves on their phone.
  const phone = await customerPhone(browser);
  await approveOnPhone(phone, link, 1, "Bola Martins");
  await expect(phone.getByText("Approved", { exact: true })).toBeVisible();

  // The studio sees the approved agreement.
  await page.goto(orderUrl);
  await expect(page.getByText("Version 1 approved").first()).toBeVisible();
  await expect(page.getByText(/Approved as “Bola Martins”/).first()).toBeVisible();
  await expect(page.locator("#agreement").getByText("$1,200").first()).toBeVisible();
});
