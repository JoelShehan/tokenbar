import { invoke } from "@tauri-apps/api/core";
import type { UsageProvider } from "./UsageProvider";
import type { ProviderUsage } from "../types/usage";

export class CodexProvider implements UsageProvider {
  id = "codex";
  name = "Codex";

  async isAvailable(): Promise<boolean> {
    return await invoke<boolean>("is_codex_installed");
  }

  async getUsage(): Promise<ProviderUsage> {
    const version = await invoke<string | null>("get_codex_version");

    return {
      id: this.id,
      name: this.name,
      connected: true,
      metrics: [],
      stats: [
        {
          label: "Version",
          value: version ?? "Detected",
        },
      ],
    };
  }
}
