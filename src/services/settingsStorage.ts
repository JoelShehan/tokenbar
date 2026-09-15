import {
  defaultSettings,
  type TokenBarSettings,
} from "../types/settings";

const SETTINGS_KEY = "tokenbar-settings";

export function loadSettings(): TokenBarSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);

    if (!raw) {
      return defaultSettings;
    }

    const stored =
      JSON.parse(raw) as Partial<TokenBarSettings>;

    const settings = { ...defaultSettings };
    for (const key of ["alwaysOnTop", "compactMode", "showCodex", "showOpenAI", "launchAtStartup", "startHidden"] as const) {
      if (typeof stored[key] === "boolean") settings[key] = stored[key];
    }
    if ([60_000, 300_000, 900_000].includes(Number(stored.refreshInterval))) settings.refreshInterval = Number(stored.refreshInterval) as TokenBarSettings["refreshInterval"];
    if (typeof stored.opacity === "number" && Number.isFinite(stored.opacity)) settings.opacity = Math.min(1, Math.max(0.6, stored.opacity));
    return settings;
  } catch (error) {
    console.error(
      "Failed to load TokenBar settings",
      error
    );

    return defaultSettings;
  }
}

export function saveSettings(
  settings: TokenBarSettings
) {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.error(
      "Failed to save TokenBar settings",
      error
    );
    throw new Error("Preferences could not be saved on this device.");
  }
}
