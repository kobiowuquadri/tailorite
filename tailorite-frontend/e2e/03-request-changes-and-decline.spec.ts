import { expect, test } from "@playwright/test";
import { publishedOrder } from "./support/api";
import { approveOnPhone, customerPhone, moneyValue, openReview, shareFromWorkbench } from "./support/ui";

test("requested changes lead to a revised version; a declined change leaves the agreement intact", async ({ page, browser }) => {
  const { orderId, link } = await publishedOrder(page);
  const phone = await customerPhone(browser);

  // The customer asks for changes to version 1 instead of approving it.
  await openReview(phone, link.url);
  await phone.getByRole("button", { name: "Request changes" }).click();
  const sheet = phone.getByRole("dialog");
  await sheet.getByLabel("What would you like changed?").fill("Please make the sleeves three-quarter length.");
  await sheet.getByLabel("Your name").fill("Ada Okafor");
  await sheet.getByRole("button", { name: "Send to the studio" }).click();
  await expect(phone.getByText("Changes requested", { exact: true })).toBeVisible();

  // The studio sees the feedback, closes it and shares a revised version.
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Ada Okafor asked for changes to version 1")).toBeVisible();
  await page.getByRole("link", { name: "Update the brief" }).click();
  await page.waitForURL(/\/brief$/);
  const feedback = page.locator("li", { hasText: "asked for changes to version 1" }).filter({ has: page.getByRole("button", { name: "Resolve" }) });
  await feedback.getByRole("button", { name: "Resolve" }).click();
  const resolve = page.getByRole("dialog");
  await resolve.getByLabel("Note *").fill("Sleeves changed to three-quarter length");
  await resolve.getByRole("button", { name: "Save resolution" }).click();
  await expect(resolve).toBeHidden();
  await page.locator("#field-sleeves").fill("Three-quarter length");
  const v2 = await shareFromWorkbench(page, 2);
  await approveOnPhone(phone, v2, 2);

  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Version 2 approved").first()).toBeVisible();
  const versions = page.locator('section[aria-labelledby="versions-title"]');
  await expect(versions.locator("li", { hasText: "Version 1" }).getByText("Changes requested").first()).toBeVisible();

  // The tailor proposes an upgrade; the customer declines it.
  await page.getByRole("button", { name: "Propose a change" }).click();
  await page.getByRole("dialog").getByLabel("What is changing and why?").fill("Silk lining upgrade (+$250).");
  await page.getByRole("dialog").getByRole("button", { name: "Start the change" }).click();
  await page.waitForURL(/\/brief$/);
  await page.locator("#field-lining").fill("Silk lining");
  await page.locator("#total-price").fill("1100");
  const v3 = await shareFromWorkbench(page, 3);

  await openReview(phone, v3);
  await phone.getByRole("button", { name: "Decline this change and keep my current agreement" }).click();
  const decline = phone.getByRole("dialog");
  await decline.getByLabel("Your name").fill("Ada Okafor");
  await decline.getByRole("button", { name: "Decline the change" }).click();
  await expect(phone.getByText(/You declined the change/)).toBeVisible();

  // Version 2 and its price remain the agreement; version 3 stays in the record.
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Version 2 approved").first()).toBeVisible();
  await expect(moneyValue(page, "Agreed total (version 2)")).toHaveText("$850");
  await expect(versions.locator("li", { hasText: "Version 3" }).getByText("Declined by customer")).toBeVisible();
  await expect(page.getByText("Version 3 awaiting approval")).toHaveCount(0);
});
