import { expect, test } from "@playwright/test";
import { createCustomer, createOrder, get, post, signUpStudio } from "./support/api";

test("brief edits survive a reload and a browser restart; a temporary AI failure recovers on its own", async ({ page, browser }) => {
  const api = await signUpStudio(page);
  const customer = await createCustomer(api);
  const order = await createOrder(api, customer.id);
  // The [[ai:transient-once]] marker makes the test provider fail once with a temporary error.
  await post(api, `/orders/${order.id}/sources/text`, {
    text: "Navy-blue floor-length dress with a square neckline. [[ai:transient-once]]",
    sender: "Ada Okafor",
    label: "Message from Ada",
  });

  await page.goto(`/orders/${order.id}/brief`);
  await page.locator("#field-neckline").fill("Square neckline, 2 inches below the collarbone");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Reload: the edit was saved on the server, not just kept in the page.
  await page.reload();
  await expect(page.locator("#field-neckline")).toHaveValue("Square neckline, 2 inches below the collarbone");

  // Browser restart: a new browser context with the same cookies is still signed in.
  const storage = await page.context().storageState();
  const restarted = await browser.newContext({ storageState: storage });
  const again = await restarted.newPage();
  await again.goto(`/orders/${order.id}/brief`);
  await expect(again.locator("#field-neckline")).toHaveValue("Square neckline, 2 inches below the collarbone");

  // A temporary provider failure is retried automatically; the brief is never changed by it.
  await again.getByRole("button", { name: "Draft the brief with AI" }).click();
  await expect(again.getByText("Suggestions to review")).toBeVisible({ timeout: 60_000 });
  await expect(again.getByText(/Processing finished: \d+ suggestions?/)).toBeVisible();
  const overview = await get<{ latest: { status: string; attempts: number } }>(again.request, `/orders/${order.id}/extractions`);
  expect(overview.latest).toMatchObject({ status: "SUCCEEDED", attempts: 2 });
  await expect(again.locator("#field-neckline")).toHaveValue("Square neckline, 2 inches below the collarbone");
  await restarted.close();
});
