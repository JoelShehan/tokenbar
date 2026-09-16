import { test, expect } from "@playwright/test";
import { ProviderManager } from "../src/providers/ProviderManager";

test("per-provider backoff, auth pause, offline preservation and recovery", async () => {
  let now = 1_000_000;
  let failure = "";
  let calls = 0;
  const manager = new ProviderManager([{
    id: "codex", name: "Codex", isAvailable: async () => true,
    getUsage: async () => {
      calls++;
      if (failure) throw new Error(failure);
      return { id: "codex", name: "Codex", connected: true, metrics: [{ label: "Quota", value: 34, displayValue: "34% left" }], stats: [] };
    },
    }, {
      id: "openai-api", name: "OpenAI API", isAvailable: async () => true,
      getUsage: async () => ({ id: "openai-api", name: "OpenAI API", connected: true, state: "no-usage", metrics: [], stats: [] }),
    }], () => now, () => 0);
  const initial = await manager.getAvailableUsage();
  const timestamp = initial.providers[0].updatedAt;
  failure = "timeout"; now += 60_000;
  let result = await manager.getAvailableUsage();
  expect(result.providers[0].stale).toBe(true);
  expect(result.providers[0].updatedAt).toBe(timestamp);
  expect(result.providers[1].state).toBe("no-usage");
  expect(calls).toBe(2);
  now += 29_999; await manager.getAvailableUsage(); expect(calls).toBe(2);
  now++; await manager.getAvailableUsage(); expect(calls).toBe(3);
  now += 59_999; await manager.getAvailableUsage(); expect(calls).toBe(3);
  now++; await manager.getAvailableUsage(); expect(calls).toBe(4);
  failure = "401 invalid credentials";
  await manager.getAvailableUsage(undefined, true);
  now += 86_400_000;
  await manager.getAvailableUsage(); expect(calls).toBe(5);
  result = await manager.getAvailableUsage(undefined, false, 60_000, false);
  expect(calls).toBe(5); expect(result.providers[0].stale).toBe(true);
  failure = "";
  result = await manager.getAvailableUsage(undefined, true);
  expect(result.providers[0].stale).toBe(false);
  expect(calls).toBe(6);
});

test("concurrent requests share a single provider call", async () => {
  let calls = 0;
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const manager = new ProviderManager([{
    id: "codex", name: "Codex", isAvailable: async () => true,
    getUsage: async () => { calls++; await gate; return { id: "codex", name: "Codex", connected: true, metrics: [], stats: [] }; },
  }]);
  const requests = Array.from({ length: 20 }, () => manager.getAvailableUsage(undefined, true));
  await Promise.resolve(); expect(calls).toBe(1);
  finish(); await Promise.all(requests); expect(calls).toBe(1);
});

test.describe("desktop event handling", () => {
  test.beforeEach(async ({ page }) => {
    await page.exposeFunction("resizeNative", async (size: { width: number; height: number }) => page.setViewportSize(size));
    await page.goto("http://localhost:1430/tests/widget-harness.html");
    await expect(page.getByText("34% left")).toBeVisible();
  });

  test("provider failures are independent; missing CLI and expired credentials", async ({ page }) => {
    await page.evaluate(() => { (window as any).fixture.apiMode = "offline"; });
    await page.getByRole("button", { name: "Refresh usage" }).click();
    await expect(page.getByText("Connected", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Stale · showing last successful update")).toHaveCount(1);
    await page.evaluate(() => { (window as any).fixture.apiMode = "connected"; (window as any).fixture.codexMode = "expired"; });
    await page.getByRole("button", { name: "Refresh usage" }).click();
    await expect(page.getByText("Sign-in required")).toHaveCount(1);
    await expect(page.getByText("No usage", { exact: true })).toBeVisible();
    await page.evaluate(() => { (window as any).fixture.codexMode = "missing"; });
    await page.getByRole("button", { name: "Refresh usage" }).click();
    await expect(page.getByText("Install Codex", { exact: false })).toBeVisible();
    await expect(page.getByText("34% left")).toHaveCount(0);
  });

  test("offline stops requests and reconnect events coalesce", async ({ page, context }) => {
    const count = () => page.evaluate(() => (window as any).fixture.calls.filter((c: any) => c.cmd === "get_codex_usage").length);
    const before = await count();
    await context.setOffline(true);
    await expect(page.getByText("Offline · refresh will resume when connected")).toBeVisible();
    await page.getByRole("button", { name: "Refresh usage" }).click();
    expect(await count()).toBe(before);
    await page.evaluate(() => { (window as any).fixture.mode = "slow"; });
    await context.setOffline(false);
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i++) { window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("focus")); await (window as any).emitTestEvent("refresh-usage"); }
    });
    await expect(page.getByRole("button", { name: "Refresh usage" })).toBeEnabled();
    expect(await count()).toBe(before + 1);
    await expect(page.getByText("Stale · showing last successful update")).toHaveCount(0);
  });

  test("sleep/wake and StrictMode keep a single refresh schedule", async ({ page }) => {
    await page.clock.install();
    const before = await page.evaluate(() => (window as any).fixture.calls.filter((c: any) => c.cmd === "get_codex_usage").length);
    await page.clock.setSystemTime(Date.now() + 3_600_000);
    await page.evaluate(async () => {
      await (window as any).emitTestEvent("tauri://resumed");
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => page.evaluate(() => (window as any).fixture.calls.filter((c: any) => c.cmd === "get_codex_usage").length)).toBe(before + 1);
    await page.clock.runFor(60_001);
    await expect.poll(() => page.evaluate(() => (window as any).fixture.calls.filter((c: any) => c.cmd === "get_codex_usage").length)).toBe(before + 2);
  });

  for (const scale of [1, 1.25, 1.5, 2]) {
    test(`secondary monitor at ${scale * 100}% DPI stays in work area`, async ({ page }) => {
      await page.evaluate(async scale => {
        const fixture = (window as any).fixture;
        fixture.scale = scale;
        fixture.area = { position: { x: -1600, y: -100 }, size: { width: 1600, height: 900 } };
        fixture.position = { x: -50, y: 750 };
        await (window as any).emitTestEvent("tauri://scale-change", { scaleFactor: scale, size: { width: 640, height: 900 } });
      }, scale);
      await expect.poll(() => page.evaluate(() => {
        const f = (window as any).fixture;
        return f.position.x + innerWidth * f.scale <= 0 && f.position.y + innerHeight * f.scale <= 800 && innerHeight * f.scale <= 900;
      })).toBe(true);
    });
  }

  test("removed monitor falls back to primary work area", async ({ page }) => {
    await page.evaluate(async () => {
      const f = (window as any).fixture; f.missingMonitor = true; f.position = { x: -5000, y: 5000 };
      await (window as any).emitTestEvent("tauri://move", f.position);
    });
    await expect.poll(() => page.evaluate(() => {
      const f = (window as any).fixture; return f.position.x >= 0 && f.position.y + innerHeight <= 1040;
    })).toBe(true);
  });
});
