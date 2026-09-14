import type { ProviderUsage } from "../types/usage";

export const mockUsage: ProviderUsage = {
  id: "openai",
  name: "OpenAI",
  connected: true,

  metrics: [
    {
      label: "Codex",
      value: 82,
      displayValue: "82%",
      subtitle: "5h limit · resets in 1h 42m",
    },
    {
      label: "Weekly",
      value: 61,
      displayValue: "61%",
      subtitle: "resets Sep 15",
    },
  ],

  stats: [
    {
      label: "API today",
      value: "$0.84",
    },
    {
      label: "Tokens",
      value: "1.8M",
    },
  ],
};