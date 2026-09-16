import { invoke } from "@tauri-apps/api/core";
import type { UsageProvider } from "./UsageProvider";
import type { ProviderUsage } from "../types/usage";
import { validateCodexUsage } from "../services/responseValidation";

function windowLabel(minutes: number | null, fallback: string) {
  if (!minutes) return fallback;
  if (minutes === 10080) return "Weekly usage";
  return minutes % 60 === 0 ? `${minutes / 60}-hour usage` : `${minutes}-minute usage`;
}

export class CodexProvider implements UsageProvider {
  id = "codex";
  name = "Codex";

  async isAvailable(): Promise<boolean> {
    return await invoke<boolean>("is_codex_installed");
  }

  async getUsage(): Promise<ProviderUsage> {
    const usage = validateCodexUsage(await invoke<unknown>("get_codex_usage"));
    const limits = usage.limits.rateLimits;
    const metrics = [limits?.primary, limits?.secondary].flatMap((window, index) =>
      window && Number.isFinite(window.usedPercent) ? [{
        label: windowLabel(window.windowDurationMins, index === 0 ? "Primary usage" : "Secondary usage"),
        value: Math.max(0, 100 - window.usedPercent),
        displayValue: `${Math.max(0, 100 - window.usedPercent)}% left`,
        subtitle: window.resetsAt ? `Resets ${new Date(window.resetsAt * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : undefined,
      }] : []
    );
    const summary = usage.activity?.summary;
    const stats = [];
    if (summary?.lifetimeTokens != null) stats.push({ label: "Lifetime tokens", value: summary.lifetimeTokens.toLocaleString() });
    if (summary?.peakDailyTokens != null) stats.push({ label: "Peak daily tokens", value: summary.peakDailyTokens.toLocaleString() });
    if (limits?.planType) stats.push({ label: "Plan", value: limits.planType });
    if (!metrics.length) stats.push({ label: "Quota", value: "Usage limits unavailable" });
    if (usage.activityError) stats.push({ label: "Token activity", value: "Unavailable from this CLI" });

    return {
      id: this.id,
      name: this.name,
      connected: true,
      state: metrics.length ? "connected" : "unavailable",
      metrics,
      stats,
    };
  }
}
