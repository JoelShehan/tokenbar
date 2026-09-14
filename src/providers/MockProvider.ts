import type { UsageProvider } from "./UsageProvider";
import type { ProviderUsage } from "../types/usage";
import { mockUsage } from "../data/mockUsage";

export class MockProvider implements UsageProvider {
  id = "mock";
  name = "Mock Provider";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getUsage(): Promise<ProviderUsage> {
    return mockUsage;
  }
}