import type { ProviderUsage } from "../types/usage";

export interface UsageProvider {
  id: string;
  name: string;

  isAvailable(): Promise<boolean>;

  getUsage(): Promise<ProviderUsage>;
}