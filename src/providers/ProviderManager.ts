import type { ProviderUsage } from "../types/usage";
import type { UsageProvider } from "./UsageProvider";

export type ProviderError = { providerId: string; providerName: string; message: string };
export type ProviderLoadResult = { providers: ProviderUsage[]; errors: ProviderError[] };

export function classifyProviderError(message: string): "auth-error" | "unavailable" {
  return /\b(401|403)\b|unauthori[sz]ed|forbidden|not logged|sign.in|authentication|expired.*token|admin.*access/i.test(message)
    ? "auth-error" : "unavailable";
}

export class ProviderManager {
  constructor(private providers: UsageProvider[]) {}

  async getAvailableUsage(enabledProviderIds?: string[]): Promise<ProviderLoadResult> {
    const results = await Promise.all(this.providers.filter(provider =>
      !enabledProviderIds || enabledProviderIds.includes(provider.id)
    ).map(async provider => {
      try {
        if (!await provider.isAvailable()) {
          return { usage: {
            id: provider.id, name: provider.name, connected: false,
            state: "unavailable", metrics: [], stats: [],
            message: provider.id === "codex"
              ? "Install Codex and sign in to see your subscription usage."
              : "Connect an organization Admin API key in Settings to see API usage.",
          } as ProviderUsage };
        }
        return { usage: { ...await provider.getUsage(), updatedAt: new Date().toISOString() } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const state = classifyProviderError(message);
        return {
          usage: {
            id: provider.id, name: provider.name, connected: false, state, metrics: [], stats: [],
            message: state === "auth-error"
              ? (provider.id === "codex" ? "Sign in to Codex again, then refresh." : "Reconnect an Admin API key with organization usage access in Settings.")
              : "Usage could not be refreshed. Try again shortly. Details are available in About.",
          } as ProviderUsage,
          error: { providerId: provider.id, providerName: provider.name, message },
        };
      }
    }));
    return { providers: results.map(result => result.usage), errors: results.flatMap(result => result.error ? [result.error] : []) };
  }
}

