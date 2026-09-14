import { useEffect, useState } from "react";
import {
  getCurrentWindow,
  LogicalSize,
} from "@tauri-apps/api/window";
import type { ProviderUsage } from "./types/usage";
import { providerManager } from "./providers";

import "./App.css";

import UsageMetric from "./components/UsageMetric";
import UsageStat from "./components/UsageStat";

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [loading, setLoading] = useState(true);

  const appWindow = getCurrentWindow();

  useEffect(() => {
    const loadUsage = async () => {
      try {
        const providerUsage =
          await providerManager.getProviderUsage();

        setProviders(providerUsage);
      } catch (error) {
        console.error("Failed to load usage", error);
      } finally {
        setLoading(false);
      }
    };

    loadUsage();
  }, []);

  const collapseWidget = async () => {
    setCollapsed(true);

    await appWindow.setSize(
      new LogicalSize(210, 56)
    );
  };

  const expandWidget = async () => {
    setCollapsed(false);

    await appWindow.setSize(
      new LogicalSize(320, 310)
    );
  };

  if (loading) {
    return (
      <main
        className="widget"
        data-tauri-drag-region
      >
        <div
          className="loading-state"
          data-tauri-drag-region
        >
          Loading usage...
        </div>
      </main>
    );
  }

  if (providers.length === 0) {
    return (
      <main
        className="widget"
        data-tauri-drag-region
      >
        <div
          className="loading-state"
          data-tauri-drag-region
        >
          No providers configured
        </div>
      </main>
    );
  }

  const activeProvider = providers.find(
    (provider) => provider.connected
  );
  const connectedCount = providers.filter(
    (provider) => provider.connected
  ).length;

  return (
    <main
      className={`widget ${collapsed ? "collapsed" : ""}`}
      data-tauri-drag-region
    >
      {collapsed ? (
        <div className="collapsed-view">
          <div className="collapsed-left">
            <div
              className={`status-dot ${
                activeProvider
                  ? ""
                  : "status-dot-muted"
              }`}
            />
            <span className="collapsed-value">
              {activeProvider?.name ?? "TokenBar"}
            </span>
          </div>

          <span className="collapsed-cost">
            {connectedCount}/{providers.length} connected
          </span>

          <button
            className="expand-button"
            onClick={expandWidget}
          >
            +
          </button>
        </div>
      ) : (
        <>
          <div
            className="widget-header"
            data-tauri-drag-region
          >
            <div
              className="brand"
              data-tauri-drag-region
            >
              <div className="status-dot" />
              <span data-tauri-drag-region>TokenBar</span>
            </div>

            <div className="header-actions">
              <button
                className="collapse-button"
                onClick={collapseWidget}
              >
                -
              </button>

              <button className="menu-button">...</button>
            </div>
          </div>

          <section
            className="provider-list"
            data-tauri-drag-region
          >
            {providers.map((provider) => (
              <section
                className="provider-section"
                key={provider.id}
                data-tauri-drag-region
              >
                <div
                  className="provider-title-row"
                  data-tauri-drag-region
                >
                  <span data-tauri-drag-region>
                    {provider.name}
                  </span>

                  <span
                    className={
                      provider.connected
                        ? "provider-status"
                        : "provider-status provider-status-muted"
                    }
                    data-tauri-drag-region
                  >
                    {provider.connected
                      ? "Connected"
                      : "Unavailable"}
                  </span>
                </div>

                {provider.metrics.map((metric) => (
                  <UsageMetric
                    key={`${provider.id}-${metric.label}`}
                    metric={metric}
                  />
                ))}

                {provider.stats.length > 0 && (
                  <section
                    className="stats-grid"
                    data-tauri-drag-region
                  >
                    {provider.stats.map((stat) => (
                      <UsageStat
                        key={`${provider.id}-${stat.label}`}
                        stat={stat}
                      />
                    ))}
                  </section>
                )}
              </section>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

export default App;
