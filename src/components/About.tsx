import { useEffect, useState } from "react";
import { getVersion, getTauriVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ProviderUsage } from "../types/usage";
import type { ProviderError } from "../providers/ProviderManager";
import type { TokenBarSettings } from "../types/settings";
import { safeError } from "../services/responseValidation";

export default function About({ providers, errors, lastAttempt, settings }: {
  providers: ProviderUsage[]; errors: ProviderError[]; lastAttempt: Date | null; settings: TokenBarSettings;
}) {
  const [version, setVersion] = useState("Checking…");
  const [runtime, setRuntime] = useState("Checking…");
  const [cli, setCli] = useState("Checking…");
  const [message, setMessage] = useState("");
  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion("Unavailable"));
    void getTauriVersion().then(setRuntime).catch(() => setRuntime("Unavailable"));
    void invoke<string | null>("get_codex_version").then(value => setCli(value ?? "Not installed")).catch(() => setCli("Unavailable"));
  }, []);
  const diagnostics = [
    `TokenBar ${version}`, `Tauri ${runtime}`, `Codex: ${cli}`,
    `Last refresh attempt: ${lastAttempt?.toISOString() ?? "None"}`,
    `Refresh interval: ${settings.refreshInterval / 60000} min`,
    `Startup: ${settings.launchAtStartup ? "enabled" : "disabled"}; start hidden: ${settings.startHidden}`,
    ...providers.map(provider => `${provider.name}: ${provider.state ?? "connected"}; updated: ${provider.updatedAt ?? "never"}`),
    ...errors.map(error => `${error.providerName}: ${safeError(error.message)}`),
  ].join("\n");
  const link = (url: string) => void openUrl(url).catch(() => setMessage("Could not open your browser."));
  return <section className="about-panel">
    <h1>TokenBar</h1><p className="section-description">Your AI usage, a glance away.</p>
    <p className="version-badge">Version {version}</p>
    <p className="section-description">Codex shows your subscription quota remaining. OpenAI API shows organization tokens and costs for the last 30 days. They are separate usage sources.</p>
    <div className="about-links">
      <button onClick={() => link("https://github.com/JoelShehan/tokenbar")}>Project ↗</button>
      <button onClick={() => link("https://github.com/JoelShehan/tokenbar/issues")}>Report an issue ↗</button>
      <button onClick={() => link("https://platform.openai.com/usage")}>API dashboard ↗</button>
    </div>
    <h2>Diagnostics</h2><p className="section-description">Connection status and recent errors. API keys and conversations are not included.</p>
    <textarea className="diagnostics" aria-label="Diagnostics" readOnly value={diagnostics} />
    <button className="secondary-button" onClick={() => void navigator.clipboard.writeText(diagnostics).then(() => setMessage("Diagnostics copied.")).catch(() => setMessage("Copy unavailable. Select the diagnostics text to copy it manually."))}>Copy diagnostics</button>
    {message && <p role="status" className="section-description">{message}</p>}
    <h2>Privacy</h2>
    <p className="section-description">TokenBar reads Codex quota percentages, reset times, plan, lifetime and peak daily token totals through the documented local CLI app-server. It reads organization API token counts and USD costs directly from OpenAI. It does not read your conversations or project files.</p>
    <p className="section-description">Usage is held in memory on this device. TokenBar has no backend, analytics, or automatic diagnostic uploads. OpenAI receives authenticated requests to supply your usage; your Codex CLI manages its own authentication and network traffic.</p>
    <p className="section-description">Admin keys are stored only in Windows Credential Manager or macOS Keychain, and briefly held in memory while entered or used. Preferences live in local webview storage; window position lives in the app configuration directory. Disconnect removes the saved API key.</p>
    <p className="section-description">Copy diagnostics writes to your system clipboard only when clicked. External links open your browser. A future backend would require an explicit product change and an updated privacy statement.</p>
  </section>;
}
