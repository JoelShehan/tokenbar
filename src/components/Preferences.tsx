import type {
  RefreshInterval,
  TokenBarSettings,
} from "../types/settings";

type Props = {
  settings: TokenBarSettings;
  onChange: (settings: TokenBarSettings) => void;
};

function Preferences({
  settings,
  onChange,
}: Props) {
  const update = (
    patch: Partial<TokenBarSettings>
  ) => {
    onChange({
      ...settings,
      ...patch,
    });
  };

  return (
    <section className="preferences">
      <div className="setting-row">
        <div>
          <strong>Refresh</strong>
          <span>Usage update interval</span>
        </div>

        <select
          aria-label="Refresh interval"
          value={settings.refreshInterval}
          onChange={(event) =>
            update({
              refreshInterval: Number(
                event.target.value
              ) as RefreshInterval,
            })
          }
        >
          <option value={60_000}>1 min</option>
          <option value={300_000}>5 min</option>
          <option value={900_000}>15 min</option>
        </select>
      </div>

      <div className="setting-row">
        <div>
          <strong>Always on top</strong>
          <span>Keep TokenBar above windows</span>
        </div>

        <input
          type="checkbox"
          aria-label="Always on top"
          checked={settings.alwaysOnTop}
          onChange={(event) =>
            update({
              alwaysOnTop: event.target.checked,
            })
          }
        />
      </div>

      <div className="setting-row">
        <div>
          <strong>Dense layout</strong>
          <span>Reduce visual spacing</span>
        </div>

        <input
          type="checkbox"
          checked={settings.compactMode}
          aria-label="Dense layout"
          onChange={(event) =>
            update({
              compactMode: event.target.checked,
            })
          }
        />
      </div>

      <div className="setting-row">
        <div>
          <strong>Launch at startup</strong>
          <span>Start TokenBar when you sign in</span>
        </div>

        <input
          type="checkbox"
          checked={settings.launchAtStartup}
          aria-label="Launch at startup"
          onChange={(event) =>
            update({
              launchAtStartup: event.target.checked,
            })
          }
        />
      </div>

      <div className="setting-row">
        <div>
          <strong>Start hidden</strong>
          <span>Launch TokenBar in the tray</span>
        </div>

        <input
          type="checkbox"
          checked={settings.startHidden}
          aria-label="Start hidden"
          onChange={(event) =>
            update({
              startHidden: event.target.checked,
            })
          }
        />
      </div>

      <div className="setting-row">
        <div>
          <strong>Codex</strong>
          <span>Show Codex provider</span>
        </div>

        <input
          type="checkbox"
          checked={settings.showCodex}
          aria-label="Show Codex"
          onChange={(event) =>
            update({
              showCodex: event.target.checked,
            })
          }
        />
      </div>

      <div className="setting-row">
        <div>
          <strong>OpenAI API</strong>
          <span>Show API usage</span>
        </div>

        <input
          type="checkbox"
          checked={settings.showOpenAI}
          aria-label="Show OpenAI API"
          onChange={(event) =>
            update({
              showOpenAI: event.target.checked,
            })
          }
        />
      </div>

      <div className="setting-column">
        <div className="setting-label-row">
          <div>
            <strong>Opacity</strong>
            <span>Widget transparency</span>
          </div>

          <span>
            {Math.round(settings.opacity * 100)}%
          </span>
        </div>

        <input
          type="range"
          aria-label="Widget opacity"
          min="0.6"
          max="1"
          step="0.05"
          value={settings.opacity}
          onChange={(event) =>
            update({
              opacity: Number(event.target.value),
            })
          }
        />
      </div>
    </section>
  );
}

export default Preferences;
