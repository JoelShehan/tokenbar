import { invoke } from "@tauri-apps/api/core";
import type { UsageProvider } from "./UsageProvider";
import type { ProviderUsage } from "../types/usage";

import { validateApiUsage } from "../services/responseValidation";

export class OpenAIApiProvider implements UsageProvider {
  id = "openai-api";
  name = "OpenAI API";

  async isAvailable(): Promise<boolean> {
    return await invoke<boolean>("has_openai_key");
  }

  async getUsage(): Promise<ProviderUsage> {
    const usage = validateApiUsage(await invoke<unknown>(
      "get_openai_usage"
    ));
    const hasUsage =
      usage.total_tokens > 0 ||
      usage.total_cost_usd > 0;

    return {
      id: this.id,
      name: this.name,
      connected: true,
      state: hasUsage ? "connected" : "no-usage",
      message: "Organization API usage · last 30 days. Subscription usage is shown under Codex.",
      metrics: [],
      stats: hasUsage
        ? [
            {
              label: "Last 30 days",
              value: `$${usage.total_cost_usd.toFixed(2)}`,
            },
            {
              label: "Tokens",
              value: usage.total_tokens.toLocaleString(),
            },
            {
              label: "Input",
              value: usage.total_input_tokens.toLocaleString(),
            },
            {
              label: "Output",
              value: usage.total_output_tokens.toLocaleString(),
            },
          ]
        : [
            {
              label: "API only · last 30 days",
              value: "0 tokens · $0.00",
            },
          ],
    };
  }
}
