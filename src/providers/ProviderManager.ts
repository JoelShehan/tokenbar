import type { ProviderUsage } from "../types/usage";
import type { UsageProvider } from "./UsageProvider";

export class ProviderManager {
  private providers: UsageProvider[];

  constructor(providers: UsageProvider[]) {
    this.providers = providers;
  }

  async getProviderUsage(): Promise<ProviderUsage[]> {
    const results: ProviderUsage[] = [];

    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();

        if (!available) {
          results.push(this.getUnavailableUsage(provider));
          continue;
        }

        const usage = await provider.getUsage();

        results.push(usage);
      } catch (error) {
        console.error(
          `Failed to load provider: ${provider.name}`,
          error
        );

        results.push(this.getUnavailableUsage(provider));
      }
    }

    return results;
  }

  private getUnavailableUsage(
    provider: UsageProvider
  ): ProviderUsage {
    return {
      id: provider.id,
      name: provider.name,
      connected: false,
      metrics: [],
      stats: [],
    };
  }
}
