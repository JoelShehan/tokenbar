export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid usage response");
  return value as Record<string, unknown>;
}

export function number(value: unknown, max = Number.MAX_SAFE_INTEGER, integer = true): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new Error("Invalid usage response");
  }
  return value;
}

export function validateApiUsage(value: unknown) {
  const data = record(value);
  const input = number(data.total_input_tokens);
  const output = number(data.total_output_tokens);
  const total = number(data.total_tokens);
  if (!Number.isSafeInteger(input + output) || total !== input + output) throw new Error("Invalid usage response");
  return { total_input_tokens: input, total_output_tokens: output, total_tokens: total, total_cost_usd: number(data.total_cost_usd, Number.MAX_SAFE_INTEGER, false) };
}

function quota(value: unknown) {
  if (value == null) return null;
  const data = record(value);
  return {
    usedPercent: number(data.usedPercent, 100, false),
    windowDurationMins: data.windowDurationMins == null ? null : number(data.windowDurationMins, 525600),
    resetsAt: data.resetsAt == null ? null : number(data.resetsAt, 253402300799),
  };
}

export function validateCodexUsage(value: unknown) {
  const data = record(value);
  const limits = record(data.limits);
  const byId = limits.rateLimitsByLimitId == null ? null : record(limits.rateLimitsByLimitId);
  const bucket = record(byId?.codex ?? limits.rateLimits);
  const activity = data.activity == null ? null : record(data.activity);
  const summary = activity?.summary == null ? null : record(activity.summary);
  const plan = typeof bucket.planType === "string" && ["free", "go", "plus", "pro", "team", "business", "enterprise", "edu", "unknown"].includes(bucket.planType) ? bucket.planType : null;
  return {
    limits: { rateLimits: { primary: quota(bucket.primary), secondary: quota(bucket.secondary), planType: plan } },
    activity: { summary: {
      lifetimeTokens: summary?.lifetimeTokens == null ? null : number(summary.lifetimeTokens),
      peakDailyTokens: summary?.peakDailyTokens == null ? null : number(summary.peakDailyTokens),
    } },
    activityError: data.activityError != null,
  };
}

// Unknown error content is never displayed, logged, or copied to diagnostics.
export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden|authentication|not logged|sign.in|expired.*token/i.test(message)) return "Authentication required. Reconnect your account.";
  if (/invalid.*response|invalid.*count|supported range|size limit|pagination/i.test(message)) return "The provider returned an invalid usage response.";
  if (/credential|keychain|keyring/i.test(message)) return "The secure credential store is unavailable.";
  if (/timeout|timed out/i.test(message)) return "The usage request timed out.";
  return "The request could not be completed. Try again shortly.";
}
