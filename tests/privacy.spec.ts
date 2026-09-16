import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.exposeFunction("resizeNative", async (size: { width: number; height: number }) => page.setViewportSize(size));
  await page.goto("http://localhost:1430/tests/widget-harness.html");
  await expect(page.getByText("34% left")).toBeVisible();
});

test("malformed responses produce unavailable states and recover", async ({ page }) => {
  await page.evaluate(() => { (window as any).fixture.mode = "malformed"; });
  await page.getByRole("button", { name: "Refresh usage" }).click();
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(2);
  await expect(page.getByText("34% left")).toBeVisible();
  await expect(page.getByText("Stale · showing last successful update")).toHaveCount(2);
  await page.evaluate(() => { (window as any).fixture.mode = "connected"; });
  await page.getByRole("button", { name: "Refresh usage" }).click();
  await expect(page.getByText("34% left")).toBeVisible();
});

test("raw auth errors never reach DOM, diagnostics or console", async ({ page }) => {
  const messages: string[] = [];
  page.on("console", message => messages.push(message.text()));
  await page.evaluate(() => { (window as any).fixture.mode = "secret-error"; });
  await page.getByRole("button", { name: "Refresh usage" }).click();
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
  const diagnostics = await page.getByRole("textbox", { name: "Diagnostics" }).inputValue();
  expect(diagnostics + await page.content() + messages.join("\n")).not.toMatch(/TEST_SECRET_SENTINEL|sk-test-only-sentinel|Authorization: Bearer/);
});
