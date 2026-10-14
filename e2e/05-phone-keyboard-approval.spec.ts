import { expect, test } from "@playwright/test";
import { publishedOrder } from "./support/api";
import { customerPhone, openReview } from "./support/ui";

test("the customer can review and approve on a phone using only the keyboard", async ({ page, browser }) => {
  const { orderId, link } = await publishedOrder(page);
  const phone = await customerPhone(browser);
  await openReview(phone, link.url);

  // Fits the screen: no sideways scrolling, and the approval action is in view.
  const [scrollWidth, innerWidth] = await phone.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  const approve = phone.getByRole("button", { name: "Approve this version" });
  await expect(approve).toBeInViewport();
  await expect(phone.getByText("₦85,000").first()).toBeVisible();

  // Keyboard only: tab to the approval button and open the sheet.
  for (let i = 0; i < 40 && !(await approve.evaluate((el) => el === document.activeElement)); i++) await phone.keyboard.press("Tab");
  await expect(approve).toBeFocused();
  await phone.keyboard.press("Enter");
  const sheet = phone.getByRole("dialog", { name: "Approve version 1" });
  await expect(sheet).toBeVisible();

  // Submitting without the name and confirmation explains what is missing.
  const submit = sheet.getByRole("button", { name: "Approve version 1" });
  await submit.focus();
  await phone.keyboard.press("Enter");
  await expect(sheet.getByText("Enter your name")).toBeVisible();
  await expect(sheet.getByText("Please confirm you have reviewed the details")).toBeVisible();

  await sheet.getByLabel("Your name").focus();
  await phone.keyboard.type("Ada Okafor");
  await phone.keyboard.press("Tab");
  const confirm = sheet.getByRole("checkbox");
  await expect(confirm).toBeFocused();
  await phone.keyboard.press("Space");
  await expect(confirm).toBeChecked();
  await submit.focus();
  await phone.keyboard.press("Enter");
  await expect(phone.getByText(/Version 1 is approved and recorded/)).toBeVisible();

  // A second submission (e.g. a double tap or another tab) cannot record another decision.
  await phone.reload();
  await expect(phone.getByText("Approved", { exact: true })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Approve this version" })).toHaveCount(0);

  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Version 1 approved").first()).toBeVisible();
});
