import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createCustomer, createOrder, futureDate, signUpStudio } from "./support/api";
import { shareFromWorkbench } from "./support/ui";

// Synthetic demo media owned by the project (tailorite-backend/fixtures/demo).
const MEDIA = resolve(__dirname, "../../tailorite-backend/fixtures/demo");

test("uploaded sources are processed by the test provider, the sleeve conflict is resolved and the brief is published", async ({ page }) => {
  // The E2E stack uses the deterministic fake provider (NODE_ENV=test). This is not evidence that live AI works.
  const api = await signUpStudio(page);
  const customer = await createCustomer(api);
  const order = await createOrder(api, customer.id);
  await page.goto(`/orders/${order.id}/brief`);

  await page.getByRole("button", { name: "Paste message" }).click();
  const paste = page.getByRole("dialog");
  await paste
    .getByLabel("Message")
    .fill("I want a navy-blue floor-length dress with a square neckline.\nPlease make the sleeves long and fitted. No slit.\nI will provide the fabric.");
  await paste.getByRole("button", { name: "Add message" }).click();
  await expect(paste).toBeHidden();

  await page.getByLabel("Upload images or audio").setInputFiles([resolve(MEDIA, "voice-note-ada.wav"), resolve(MEDIA, "reference-navy-gown.png")]);
  await expect(page.getByRole("heading", { name: "Customer material (3)" })).toBeVisible();

  await expect(page.getByText("Test provider").first()).toBeVisible();
  await page.getByRole("button", { name: "Draft the brief with AI" }).click();
  await expect(page.getByText("Suggestions to review")).toBeVisible({ timeout: 60_000 });

  // Both instructions are shown with their sources; nothing is picked silently.
  const questions = page.locator("section", { has: page.getByRole("heading", { name: "Questions and conflicts" }) });
  const conflict = questions.locator("li", { hasText: "sleeves" }).first();
  await expect(conflict.getByText("“Long and fitted”")).toBeVisible();
  await expect(conflict.getByText("“Elbow length”")).toBeVisible();
  await expect(conflict.getByRole("button", { name: /Voice note/ })).toBeVisible();

  const suggestions = page.locator("#section-suggestions");
  while ((await suggestions.getByRole("button", { name: "Accept", exact: true }).count()) > 0) {
    const before = await suggestions.getByRole("button", { name: "Accept", exact: true }).count();
    await suggestions.getByRole("button", { name: "Accept", exact: true }).first().click();
    await expect(suggestions.getByRole("button", { name: "Accept", exact: true })).toHaveCount(before - 1);
  }

  await conflict.getByRole("button", { name: "Resolve" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Use “Elbow length”").click();
  await dialog.getByRole("button", { name: "Save resolution" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#field-sleeves")).toHaveValue("Elbow length");

  // The "how fitted" question from the provider, then the details only the tailor can confirm.
  const fit = questions.locator("li", { hasText: "How fitted" }).first();
  await fit.getByRole("button", { name: "Resolve" }).click();
  await page.getByRole("dialog").getByLabel("Agreed value").fill("Fitted bodice, relaxed skirt");
  await page.getByRole("dialog").getByRole("button", { name: "Save resolution" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.locator("#field-garmentType").fill("Floor-length dress");
  await page.locator("#field-overallStyle").fill("Navy-blue floor-length evening dress");
  await page.locator("#field-fabric").fill("Customer-supplied navy crepe");
  await page.getByRole("radio", { name: "Measurements will be taken at a fitting" }).click();
  await page.locator("#fitting-date").fill(futureDate(7));
  await page.locator("#total-price").fill("85000");
  await page.locator("#deposit").fill("30000");
  await page.locator("#delivery-date").fill(futureDate(21));
  await expect(page.getByText("Ready for customer review").first()).toBeVisible();

  await shareFromWorkbench(page, 1);
  await page.goto(`/orders/${order.id}`);
  await expect(page.getByText("Version 1 awaiting approval").first()).toBeVisible();
});
