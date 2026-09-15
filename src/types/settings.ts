export type RefreshInterval =
  | 60_000
  | 300_000
  | 900_000;

export type TokenBarSettings = {
  refreshInterval: RefreshInterval;
  alwaysOnTop: boolean;
  opacity: number;
  compactMode: boolean;
  showCodex: boolean;
  showOpenAI: boolean;
  launchAtStartup: boolean;
  startHidden: boolean;
};

export const defaultSettings: TokenBarSettings = {
  refreshInterval: 60_000,
  alwaysOnTop: true,
  opacity: 0.96,
  compactMode: false,
  showCodex: true,
  showOpenAI: true,
  launchAtStartup: false,
  startHidden: false,
};
