export type UsageMetric = {
  label: string;
  value: number;
  displayValue: string;
  subtitle?: string;
};

export type UsageStat = {
  label: string;
  value: string;
};

export type ProviderUsage = {
  id: string;
  name: string;
  connected: boolean;
  state?: "connected" | "no-usage" | "unavailable" | "auth-error";
  message?: string;
  updatedAt?: string;
  metrics: UsageMetric[];
  stats: UsageStat[];
};
