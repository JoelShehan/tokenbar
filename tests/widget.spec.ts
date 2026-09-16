import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.exposeFunction("resizeNative", async (size: { width: number; height: number }) => {
    await page.setViewportSize(size);
  });
});

test("expansion restores natural height without opening settings", async ({ page }) => {
  await page.goto("http://localhost:1430/tests/widget-harness.html");
  await expect(page.getByText("34% left")).toBeVisible();
  await expect(page.getByText("Window size could not be updated.")).toHaveCount(0);
  await expect.poll(() => page.viewportSize()!.height).toBeGreaterThan(450);
  const height = page.viewportSize()!.height;
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: "Collapse widget" }).click();
    await expect.poll(() => page.viewportSize()!.width).toBe(240);
    await page.getByRole("button", { name: "Expand widget" }).click();
    await expect.poll(() => page.viewportSize()!.height).toBe(height);
    await expect(page.getByText("Lifetime tokens")).toBeVisible();
    const geometry = await page.evaluate(() => {
      const main = document.querySelector("main")!.getBoundingClientRect();
      const provider = document.querySelector(".provider-card")!.getBoundingClientRect();
      return { height: main.height, viewport: innerHeight, providerBottom: provider.bottom };
    });
    expect(geometry.height).toBe(geometry.viewport);
    expect(geometry.providerBottom).toBeLessThan(geometry.viewport);
  }
  await page.screenshot({ path: "test-results/widget-expanded.png" });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.screenshot({ path: "test-results/widget-settings.png" });
  await page.getByRole("checkbox", { name: "Dense layout" }).check();
  await page.getByRole("button", { name: "Back to usage" }).click();
  await expect.poll(() => page.viewportSize()!.height).toBeLessThan(height);
});

test("provider errors never display stale quotas as current", async ({ page }) => {
  await page.goto("http://localhost:1430/tests/widget-harness.html");
  await expect(page.getByText("No usage", { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).fixture.mode = "auth"; });
  await page.getByRole("button", { name: "Refresh usage" }).click();
  await expect(page.getByText("Sign-in required")).toHaveCount(2);
  await expect(page.getByText("34% left")).toBeVisible();
  await expect(page.getByText("Stale · showing last successful update")).toHaveCount(2);
  await page.evaluate(() => { (window as any).fixture.mode = "offline"; });
  await page.getByRole("button", { name: "Refresh usage" }).click();
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(2);
  await page.evaluate(() => { (window as any).fixture.mode = "connected"; });
  await page.getByRole("button", { name: "Refresh usage" }).click();
  await expect(page.getByText("34% left")).toBeVisible();
});

test("settings, About, refresh progress and native action wiring", async ({ page }) => {
  await page.goto("http://localhost:1430/tests/widget-harness.html");
  await expect(page.getByText("34% left")).toBeVisible();
  await page.evaluate(() => { (window as any).fixture.mode = "slow"; });
  await page.getByRole("button", { name: "Refresh usage" }).click();
  await expect(page.getByText("Refreshing…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh usage" })).toBeEnabled();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("checkbox", { name: "Launch at startup" }).check();
  await expect.poll(() => page.evaluate(() => (window as any).fixture.startup)).toBe(true);
  await page.getByRole("checkbox", { name: "Start hidden" }).check();
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByText("Version 0.1.0-test")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Diagnostics" })).toContainText("Codex: connected");
  await page.screenshot({ path: "test-results/widget-about.png" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Hide to tray" }).click();
  await page.getByRole("button", { name: "Quit TokenBar" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).fixture.calls.some((call: any) => call.cmd === "quit_app"))).toBe(true);
  await page.reload();
  await expect(page.getByText("34% left")).toBeVisible();
  expect(await page.evaluate(() => (window as any).fixture.calls.some((call: any) => call.cmd === "plugin:window|show"))).toBe(false);
});

test("missing providers are actionable and moving saves position", async ({ page }) => {
  await page.goto("http://localhost:1430/tests/widget-harness.html");
  await expect(page.getByText("34% left")).toBeVisible();
  await page.evaluate(async () => {
    (window as any).fixture.mode = "missing";
    await (window as any).emitTestEvent("tauri://move", { x: 300, y: 200 });
    await (window as any).emitTestEvent("refresh-usage");
  });
  await expect(page.getByText("Install Codex", { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).fixture.calls.some((call: any) => call.cmd === "plugin:window-state|save_window_state"))).toBe(true);
  await page.evaluate(() => (window as any).emitTestEvent("navigate", "about"));
  await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
});
