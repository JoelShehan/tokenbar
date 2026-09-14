import { invoke } from "@tauri-apps/api/core";
import type { UsageProvider } from "./UsageProvider";
import type { ProviderUsage } from "../types/usage";

type OpenAiUsageSummary = {
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
};

export class OpenAIApiProvider implements UsageProvider {
  id = "openai-api";
  name = "OpenAI API";

  async isAvailable(): Promise<boolean> {
    return await invoke<boolean>("has_openai_key");
  }

  async getUsage(): Promise<ProviderUsage> {
    const usage = await invoke<OpenAiUsageSummary>(
      "get_openai_usage"
    );

    return {
      id: this.id,
      name: this.name,
      connected: true,
      metrics: [],
      stats: [
        {
          label: "Today",
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
      ],
    };
  }
}
