import type { ProviderUsage } from "../types/usage";
import type { UsageProvider } from "./UsageProvider";
import { safeError } from "../services/responseValidation";

export type ProviderError = { providerId: string; providerName: string; message: string };
export type ProviderLoadResult = { providers: ProviderUsage[]; errors: ProviderError[] };
type Entry = { usage: ProviderUsage; error?: ProviderError; failures: number; next: number; lastSuccess?: ProviderUsage };

export function classifyProviderError(message: string): "auth-error" | "unavailable" {
  return /\b(401|403)\b|unauthori[sz]ed|forbidden|not logged|sign.in|authentication|expired.*token|admin.*access/i.test(message)
    ? "auth-error" : "unavailable";
}

export class ProviderManager {
  private cache = new Map<string, Entry>();
  private pending = new Map<string, Promise<Entry>>();
  constructor(private providers: UsageProvider[], private now = () => Date.now(), private random = Math.random) {}

  invalidate(id: string) { this.cache.delete(id); }

  nextDelay(ids: string[], interval: number) {
    const due = ids.map(id => this.cache.get(id)?.next ?? this.now());
    return Math.max(1000, Math.min(interval, ...due.map(time => time - this.now())));
  }

  async getAvailableUsage(
    enabledProviderIds?: string[], force = false, interval = 60_000, online = true,
    onUpdate?: (usage: ProviderUsage, error?: ProviderError) => void,
  ): Promise<ProviderLoadResult> {
    // Disabling/disconnecting a provider must not revive a previous account's cache.
    if (enabledProviderIds) for (const id of this.cache.keys()) if (!enabledProviderIds.includes(id)) this.cache.delete(id);
    const results = await Promise.all(this.providers.filter(p => !enabledProviderIds || enabledProviderIds.includes(p.id)).map(async provider => {
      const previous = this.cache.get(provider.id);
      const failed = (message: string, state: "auth-error" | "unavailable", failures: number): Entry => {
        const lastSuccess = previous?.lastSuccess;
        const delay = state === "auth-error" ? Infinity : Math.min(900_000, 30_000 * 2 ** Math.min(failures - 1, 5) * (1 + this.random() * .2));
        return {
          usage: { id: provider.id, name: provider.name, connected: false, state,
            metrics: lastSuccess?.metrics ?? [], stats: lastSuccess?.stats ?? [], updatedAt: lastSuccess?.updatedAt,
            stale: !!lastSuccess, message,
          },
          error: { providerId: provider.id, providerName: provider.name, message },
          lastSuccess, failures, next: this.now() + delay,
        };
      };
      let result: Entry;
      if (!online) {
        result = failed("Offline. Waiting for an internet connection.", "unavailable", previous?.failures || 1);
        this.cache.set(provider.id, result);
      } else if (this.pending.has(provider.id)) {
        result = await this.pending.get(provider.id)!;
      } else if (!force && previous && this.now() < previous.next) {
        result = previous;
      } else {
        const request = (async (): Promise<Entry> => {
          try {
            if (!await provider.isAvailable()) {
              return { usage: { id: provider.id, name: provider.name, connected: false, state: "unavailable", metrics: [], stats: [],
                message: provider.id === "codex" ? "Install Codex and sign in to see your subscription usage." : "Connect an organization Admin API key in Settings to see API usage."
              }, failures: 0, next: this.now() + interval };
            }
            const usage = { ...await provider.getUsage(), stale: false, updatedAt: new Date(this.now()).toISOString() };
            return { usage, lastSuccess: usage, failures: 0, next: this.now() + interval };
          } catch (error) {
            const message = safeError(error);
            const state = classifyProviderError(message);
            return failed(state === "auth-error" ? "Authentication required. Reconnect your account, then refresh." : message, state, (previous?.failures ?? 0) + 1);
          }
        })();
        this.pending.set(provider.id, request);
        try { result = await request; this.cache.set(provider.id, result); }
        finally { this.pending.delete(provider.id); }
      }
      onUpdate?.(result.usage, result.error);
      return result;
    }));
    return { providers: results.map(r => r.usage), errors: results.flatMap(r => r.error ? [r.error] : []) };
  }
}

