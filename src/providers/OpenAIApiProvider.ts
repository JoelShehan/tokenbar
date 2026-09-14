import type { UsageProvider } from "./UsageProvider";
import type { ProviderUsage } from "../types/usage";

export class OpenAIApiProvider implements UsageProvider {
  id = "openai-api";
  name = "OpenAI API";

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getUsage(): Promise<ProviderUsage> {
    return {
      id: this.id,
      name: this.name,
      connected: false,
      metrics: [],
      stats: [],
    };
  }
}
