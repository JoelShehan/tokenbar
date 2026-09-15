import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize, PhysicalPosition, currentMonitor } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import { listen } from "@tauri-apps/api/event";
import type { ProviderUsage } from "./types/usage";
import type { TokenBarSettings } from "./types/settings";
import { providerManager } from "./providers";
import type { ProviderError } from "./providers/ProviderManager";
import { loadSettings, saveSettings } from "./services/settingsStorage";
import Preferences from "./components/Preferences";
import OpenAIConnection from "./components/OpenAIConnection";
import ProviderCard from "./components/ProviderCard";
import About from "./components/About";
import "./App.css";

const appWindow = getCurrentWindow();
type Screen = "usage" | "settings" | "about";

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [collapsed, setCollapsed] = useState(false);
  const [screen, setScreen] = useState<Screen>("usage");
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [errors, setErrors] = useState<ProviderError[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<Date | null>(null);
  const [notice, setNotice] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const requestId = useRef(0);
  const refreshQueue = useRef<Promise<void>>(Promise.resolve());
  const resizeQueue = useRef<Promise<void>>(Promise.resolve());
  const startupDone = useRef(false);
  const initialHidden = useRef(settings.startHidden);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    refreshQueue.current = refreshQueue.current.catch(() => {}).then(async () => {
      if (id !== requestId.current) return;
      setRefreshing(true);
      const current = settingsRef.current;
      const enabled = [...(current.showCodex ? ["codex"] : []), ...(current.showOpenAI ? ["openai-api"] : [])];
      try {
        const result = await providerManager.getAvailableUsage(enabled);
        if (id !== requestId.current) return;
        setProviders(result.providers);
        setErrors(result.errors);
        setLastAttempt(new Date());
      } catch {
        setNotice("Refresh failed. Please try again.");
      } finally {
        if (id === requestId.current) setRefreshing(false);
      }
    });
    return refreshQueue.current;
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), settings.refreshInterval);
    return () => window.clearInterval(timer);
  }, [refresh, settings.refreshInterval, settings.showCodex, settings.showOpenAI]);

  useEffect(() => {
    let disposed = false;
    let timer = 0;
    const subscriptions = [
      appWindow.onMoved(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void saveWindowState(StateFlags.POSITION).catch(() => setNotice("Window position could not be saved."));
        }, 350);
      }),
      listen<string>("navigate", event => {
        setCollapsed(false);
        setScreen(event.payload === "about" ? "about" : "settings");
      }),
      listen("refresh-usage", () => void refresh()),
    ];
    const cleanup: (() => void)[] = [];
    subscriptions.forEach(promise => {
      void promise.then(unlisten => disposed ? unlisten() : cleanup.push(unlisten))
        .catch(() => setNotice("Some desktop controls could not be initialized."));
    });
    void isEnabled().then(launchAtStartup => {
      if (!disposed) setSettings(previous => ({ ...previous, launchAtStartup }));
    }).catch(() => setNotice("Startup status could not be checked."));
    void appWindow.setAlwaysOnTop(settingsRef.current.alwaysOnTop)
      .catch(() => setNotice("Always on top could not be applied."));
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      cleanup.forEach(unlisten => unlisten());
    };
  }, [refresh]);

  const changeSettings = async (next: TokenBarSettings) => {
    if (settingsBusy) return;
    setSettingsBusy(true);
    setNotice("");
    try {
      if (next.launchAtStartup !== settings.launchAtStartup) {
        await (next.launchAtStartup ? enable() : disable());
        if (await isEnabled() !== next.launchAtStartup) throw new Error("Startup preference was not applied.");
      }
      if (next.alwaysOnTop !== settings.alwaysOnTop) await appWindow.setAlwaysOnTop(next.alwaysOnTop);
      saveSettings(next);
      setSettings(next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Preference could not be saved. Please try again.");
    } finally {
      setSettingsBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    resizeQueue.current = resizeQueue.current.catch(() => {}).then(async () => {
      if (cancelled) return;
      let height = collapsed ? 56 : screen !== "usage" ? 580 : 180;
      const width = collapsed ? 240 : 320;
      if (!collapsed && screen === "usage" && contentRef.current) {
        const measurement = contentRef.current.parentElement!.cloneNode(false) as HTMLElement;
        measurement.setAttribute("aria-hidden", "true");
        measurement.inert = true;
        Object.assign(measurement.style, {
          position: "fixed", left: "-10000px", top: "0", width: "320px",
          height: "auto", visibility: "hidden", pointerEvents: "none", transition: "none",
        });
        measurement.appendChild(contentRef.current.cloneNode(true));
        document.body.appendChild(measurement);
        try { height = Math.max(180, Math.ceil(measurement.getBoundingClientRect().height)); }
        finally { measurement.remove(); }
      }
      const monitor = await currentMonitor();
      const scale = monitor?.scaleFactor ?? 1;
      height = Math.min(height, 700, monitor ? monitor.workArea.size.height / scale : 700);
      if (cancelled) return;
      await appWindow.setSize(new LogicalSize(width, height));
      if (monitor) {
        const pos = await appWindow.outerPosition();
        const size = await appWindow.outerSize();
        const area = monitor.workArea;
        const x = Math.max(area.position.x, Math.min(pos.x, area.position.x + area.size.width - size.width));
        const y = Math.max(area.position.y, Math.min(pos.y, area.position.y + area.size.height - size.height));
        if (x !== pos.x || y !== pos.y) await appWindow.setPosition(new PhysicalPosition(x, y));
      }
      if (!startupDone.current && !cancelled) {
        startupDone.current = true;
        if (!initialHidden.current) await appWindow.show();
      }
    }).catch(() => {
      setNotice("Window size could not be updated.");
      if (!initialHidden.current) void appWindow.show();
    });
    return () => { cancelled = true; };
  }, [collapsed, screen, providers, refreshing, lastAttempt, notice, settings.compactMode, settings.showCodex, settings.showOpenAI]);

  const visible = providers.filter(provider => provider.id === "codex" ? settings.showCodex : settings.showOpenAI);
  const primary = visible.find(provider => provider.connected && provider.state !== "unavailable");
  const summary = primary?.metrics[0]?.displayValue ?? primary?.stats[0]?.value ?? (refreshing ? "Refreshing…" : "Unavailable");
  const updatedTimes = visible.flatMap(provider => provider.updatedAt ? [provider.updatedAt] : []).sort();
  const updated = updatedTimes[updatedTimes.length - 1];
  const hide = () => void appWindow.hide().catch(() => setNotice("Could not hide the widget."));
  const navigate = (next: Screen) => { setCollapsed(false); setScreen(next); };

  return <main className={`widget ${collapsed ? "collapsed" : ""} ${settings.compactMode ? "compact" : ""} ${screen !== "usage" ? "settings-open" : ""}`}
    style={{ opacity: settings.opacity }} data-tauri-drag-region
    onKeyDown={event => { if (event.key === "Escape") { if (screen !== "usage") navigate("usage"); else if (collapsed) setCollapsed(false); } }}>
    {collapsed ? <div className="collapsed-view" data-tauri-drag-region>
      <span className={`status-dot ${!primary ? "status-dot-muted" : ""} ${refreshing ? "pulse" : ""}`} />
      <span className="collapsed-value" title={updated ? `Updated ${new Date(updated).toLocaleString()}` : "No successful update"} data-tauri-drag-region>{summary}</span>
      <span className="collapsed-cost" data-tauri-drag-region>{primary?.name ?? "TokenBar"}</span>
      <button aria-label="Expand widget" title="Expand widget" onClick={() => setCollapsed(false)}>＋</button>
    </div> : <div ref={contentRef} className="widget-content" data-tauri-drag-region>
      <header className="widget-header" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region><span className="status-dot" />TokenBar</div>
        <div className="header-actions">
          {screen === "usage" && <button className={refreshing ? "refreshing" : ""} aria-label="Refresh usage" title="Refresh usage" disabled={refreshing} onClick={() => void refresh()}>↻</button>}
          <button aria-label="Collapse widget" title="Collapse widget" onClick={() => { setScreen("usage"); setCollapsed(true); }}>−</button>
          <button aria-label={screen === "usage" ? "Open settings" : "Back to usage"} title={screen === "usage" ? "Settings" : "Back to usage"} onClick={() => navigate(screen === "usage" ? "settings" : "usage")}>{screen === "usage" ? "•••" : "×"}</button>
        </div>
      </header>
      {screen === "usage" ? <>
        <div className="providers-list">
          {!settings.showCodex && !settings.showOpenAI ? <div className="empty-state"><strong>Choose your providers</strong><p>Enable Codex or OpenAI API to start tracking usage.</p><button className="text-button" onClick={() => navigate("settings")}>Open settings</button></div>
            : !visible.length ? <div className="empty-state" role="status">Reading your usage…</div>
            : visible.map(provider => <ProviderCard key={provider.id} provider={provider} />)}
        </div>
        <footer className="widget-footer" aria-live="polite">
          <span>{refreshing ? "Refreshing…" : updated ? `Updated ${new Date(updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No successful update"}</span>
          {errors.length > 0 && <button className="text-button" onClick={() => navigate("about")}>Details</button>}
        </footer>
      </> : <div className="settings-panel">
        <nav className="screen-tabs" aria-label="Preferences pages"><button aria-current={screen === "settings" ? "page" : undefined} onClick={() => navigate("settings")}>Settings</button><button aria-current={screen === "about" ? "page" : undefined} onClick={() => navigate("about")}>About</button></nav>
        {screen === "settings" ? <>
          <h1>Make it yours</h1><p className="section-description">Preferences save automatically.</p>
          <fieldset disabled={settingsBusy}><Preferences settings={settings} onChange={next => void changeSettings(next)} /></fieldset>
          <h2>API connection</h2><OpenAIConnection onConnectionChange={() => void refresh()} />
          <h2>Window</h2><p className="section-description">Drag the header to move TokenBar. Your position is remembered. Closing the window keeps it in the tray.</p>
          <div className="action-row"><button onClick={hide}>Hide to tray</button><button onClick={() => void invoke("quit_app").catch(() => setNotice("Could not quit. Try the tray menu."))}>Quit TokenBar</button></div>
        </> : <About providers={visible} errors={errors} lastAttempt={lastAttempt} settings={settings} />}
      </div>}
      {notice && <div className="notice" role="alert">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice("")}>×</button></div>}
    </div>}
  </main>;
}

