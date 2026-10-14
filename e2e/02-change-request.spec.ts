import { expect, test } from "@playwright/test";
import { publishedOrder } from "./support/api";
import { approveOnPhone, customerPhone, moneyValue, openReview, shareFromWorkbench } from "./support/ui";

test("customer change request → tailor proposal → acceptance updates the agreement, history and balance", async ({ page, browser }) => {
  const { orderId } = await publishedOrder(page, { approve: true });
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Version 1 approved").first()).toBeVisible();

  // Deposit recorded by the studio.
  await page.getByRole("button", { name: "Record payment" }).click();
  const payment = page.getByRole("dialog");
  await payment.getByLabel("Amount").fill("30000");
  await payment.getByLabel("How it was paid (optional)").fill("Bank transfer");
  await payment.getByRole("button", { name: "Record entry" }).click();
  await expect(moneyValue(page, "Balance due")).toHaveText("₦55,000");

  // Fresh change-request link for the approved version.
  await page.getByRole("button", { name: "Send a change-request link" }).click();
  const linkDialog = page.getByRole("dialog");
  await linkDialog.getByRole("button", { name: "Create change-request link" }).click();
  const changeLink = await linkDialog.getByLabel("Customer link").inputValue();
  await linkDialog.getByRole("button", { name: "Done" }).click();

  // The customer asks for heavier beading.
  const phone = await customerPhone(browser);
  await openReview(phone, changeLink);
  await phone.getByRole("button", { name: "Ask for a change" }).click();
  const sheet = phone.getByRole("dialog");
  await sheet.getByLabel("What would you like to change?").fill("Please make the neckline beading heavier.");
  await sheet.getByLabel("Your name").fill("Ada Okafor");
  await sheet.getByRole("button", { name: "Send to the studio" }).click();
  await expect(phone.getByText(/Your change request was sent/)).toBeVisible();

  // The tailor prepares the proposal: +₦15,000 and two days later.
  await page.reload();
  await expect(page.getByText("The customer asked for a change")).toBeVisible();
  await expect(page.getByText("Please make the neckline beading heavier.").first()).toBeVisible();
  await page.getByRole("button", { name: "Prepare a proposal" }).click();
  await page.getByRole("dialog").getByLabel("Summary of the change for the customer").fill("Heavier neckline beading (+₦15,000), delivery two days later.");
  await page.getByRole("dialog").getByRole("button", { name: "Start the proposal" }).click();
  await page.waitForURL(/\/brief$/);
  await expect(page.getByText("Preparing a change to approved version 1")).toBeVisible();
  await page.locator("#field-embellishments").fill("Heavier beading around the neckline");
  await page.locator("#total-price").fill("100000");
  const delivery = page.locator("#delivery-date");
  const before = await delivery.inputValue();
  const later = new Date(`${before}T00:00:00Z`);
  later.setUTCDate(later.getUTCDate() + 2);
  await delivery.fill(later.toISOString().slice(0, 10));
  const v2Link = await shareFromWorkbench(page, 2);

  // While V2 is pending, V1 and its ₦85,000 total stay in force.
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Version 1 approved").first()).toBeVisible();
  await expect(page.getByText("Version 2 awaiting approval").first()).toBeVisible();
  await expect(moneyValue(page, "Agreed total (version 1)")).toHaveText("₦85,000");
  await expect(moneyValue(page, "Balance due")).toHaveText("₦55,000");
  await expect(page.getByText(/If the customer approves, the balance becomes ₦70,000/)).toBeVisible();

  // The customer reviews the comparison and accepts.
  await openReview(phone, v2Link);
  await expect(phone.getByRole("heading", { name: "What is changing" })).toBeVisible();
  await expect(phone.getByText("+₦15,000").first()).toBeVisible();
  await expect(phone.getByText("2 days later").first()).toBeVisible();
  await approveOnPhone(phone, v2Link, 2);

  // Agreement, balance and history.
  await page.reload();
  await expect(page.getByText("Version 2 approved").first()).toBeVisible();
  await expect(moneyValue(page, "Agreed total (version 2)")).toHaveText("₦100,000");
  await expect(moneyValue(page, "Balance due")).toHaveText("₦70,000");
  await expect(page.getByText("Approved, later replaced")).toBeVisible();
  await expect(page.getByText(/approved version 2; it replaces version 1/)).toBeVisible();
});
