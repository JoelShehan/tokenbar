import type { ProviderUsage } from "../types/usage";
import UsageMetric from "./UsageMetric";
import UsageStat from "./UsageStat";

type Props = {
  provider: ProviderUsage;
};

function ProviderCard({ provider }: Props) {
  return (
    <section
      className="provider-card"
      data-tauri-drag-region
    >
      <div
        className="provider-header"
        data-tauri-drag-region
      >
        <div
          className="provider-name-row"
          data-tauri-drag-region
        >
          <div
            className={`provider-dot ${
              provider.connected ? "connected" : ""
            }`}
          />

          <span data-tauri-drag-region>
            {provider.name}
          </span>
        </div>

        <span
          className="provider-status"
          data-tauri-drag-region
        >
          {{ connected: "Connected", "no-usage": "No usage", unavailable: "Unavailable", "auth-error": "Sign-in required" }[provider.state ?? (provider.connected ? "connected" : "unavailable")]}
        </span>
      </div>

      <div
        className="provider-content"
        data-tauri-drag-region
      >
        {provider.message && <p className="provider-message">{provider.message}</p>}
        {provider.metrics.map((metric) => (
          <UsageMetric
            key={`${provider.id}-${metric.label}`}
            metric={metric}
          />
        ))}

        {provider.stats.length > 0 && (
          <>
            <div
              className="divider"
              data-tauri-drag-region
            />

            <div
              className="stats-grid"
              data-tauri-drag-region
            >
              {provider.stats.map((stat) => (
                <UsageStat
                  key={`${provider.id}-${stat.label}`}
                  stat={stat}
                />
              ))}
            </div>
          </>
        )}
        {provider.updatedAt && <p className="provider-updated">Updated {new Date(provider.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
      </div>
    </section>
  );
}

export default ProviderCard;
