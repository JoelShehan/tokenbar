import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.exposeFunction("resizeNative", async (size: { width: number; height: number }) => page.setViewportSize(size));
  await page.goto("http://localhost:1430/tests/widget-harness.html?fresh");
  await expect(page.getByRole("button", { name: "Connect Codex", exact: true })).toBeVisible();
});

test("first install connects through the widget and disconnect clears previous usage", async ({ page }) => {
  await expect(page.getByText("OpenAI API", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Connect Codex", exact: true }).click();
  await expect(page.getByText("Finish signing in in your browser, then return here.")).toBeVisible();
  await page.evaluate(() => (window as any).fixture.finishLogin());
  await expect(page.getByText("34% left")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Codex", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Disconnect Codex", exact: true }).click();
  await expect(page.getByText("Disconnected.")).toBeVisible();
  await page.getByRole("button", { name: "Back to usage" }).click();
  await expect(page.getByText("34% left")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect Codex", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/first-run-connect.png" });
});

test("sign-in can be cancelled and retried while navigating", async ({ page }) => {
  await page.getByRole("button", { name: "Connect Codex", exact: true }).click();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Cancel sign-in", exact: true }).click();
  await expect(page.getByText("Sign-in cancelled.")).toBeVisible();
  await page.getByRole("button", { name: "Connect Codex", exact: true }).click();
  await page.evaluate(() => (window as any).fixture.finishLogin());
  await expect(page.getByRole("button", { name: "Disconnect Codex", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to usage" }).click();
  await expect(page.getByText("34% left")).toBeVisible();
});
