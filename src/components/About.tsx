import { useEffect, useState } from "react";
import { getVersion, getTauriVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ProviderUsage } from "../types/usage";
import type { ProviderError } from "../providers/ProviderManager";
import type { TokenBarSettings } from "../types/settings";

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
    ...errors.map(error => `${error.providerName}: ${error.message.replace(/sk-[\w-]+/g, "[redacted]")}`),
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
    <h2>Privacy</h2><p className="section-description">Usage is read from your signed-in Codex CLI and OpenAI. Your API key stays in the operating system credential store. Preferences and window position stay on this device.</p>
  </section>;
}
