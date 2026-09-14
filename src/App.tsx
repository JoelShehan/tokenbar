import { useCallback, useEffect, useState } from "react";
import {
  getCurrentWindow,
  LogicalSize,
} from "@tauri-apps/api/window";
import type { ProviderUsage } from "./types/usage";
import { providerManager } from "./providers";

import "./App.css";

import OpenAIConnection from "./components/OpenAIConnection";
import ProviderCard from "./components/ProviderCard";

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [loading, setLoading] = useState(true);

  const appWindow = getCurrentWindow();

  const loadUsage = useCallback(async () => {
    try {
      const providerUsage =
        await providerManager.getAvailableUsage();

      setProviders(providerUsage);
    } catch (error) {
      console.error("Failed to load usage", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

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

  const primaryProvider = providers.find(
    (provider) => provider.connected
  );

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
                primaryProvider
                  ? ""
                  : "status-dot-muted"
              }`}
            />
            <span className="collapsed-value">
              {primaryProvider?.metrics[0]?.displayValue ?? "--"}
            </span>
          </div>

          <span className="collapsed-cost">
            {primaryProvider?.name ?? "No provider"}
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

          <div
            className="providers-list"
            data-tauri-drag-region
          >
            <OpenAIConnection
              onConnectionChange={loadUsage}
            />

            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

export default App;
