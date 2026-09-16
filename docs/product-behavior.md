# TokenBar behavior and verification

## Widget

- Expanded: 320 logical pixels wide, measured from full content. Height is capped at 700 pixels and the current monitor's work area; provider content scrolls when needed.
- Collapsed: 240 × 56 logical pixels. Displays the first available provider's summary. Expand returns to the usage screen. Dense layout is a separate spacing preference.
- Codex quota bars show **remaining**, calculated as 100 minus the server's used percentage. Reset times use the device's local time zone.
- Refresh uses one completion-based timer. Overlapping refresh, reconnect, focus, and wake triggers share the current request. Providers run independently and publish their results as they finish.
- Provider states: Connected, No usage (successful zero API totals), Unavailable, and Sign-in required. Failures retain the last successful values and timestamp with an explicit stale label, including in collapsed mode. This cache is memory-only and clears when the app exits or the provider is disconnected/disabled.
- Transient failures use independent exponential backoff starting at 30 seconds with up to 20% jitter, capped at 15 minutes. A healthy provider continues its normal interval. Auth errors pause automatic retry until a manual refresh/reconnect. Manual refresh deliberately bypasses the retry delay.
- While offline, no provider requests are started. Reconnection triggers one refresh; focus/visibility/resume and overdue timers check for due updates after sleep without replaying missed intervals.
- API calls time out after 20 seconds; the complete paginated API refresh has a 45-second deadline. Each Codex app-server exchange has a 20-second deadline, and the CLI version probe is limited to 3 seconds.

## Settings and About

- Settings save locally. Invalid stored values fall back to supported defaults. OS startup status is read on launch; autostart changes are verified before showing success.
- A replacement API key is validated before replacing the stored key. Keys stay in the OS credential store.
- About reads the app and Tauri versions dynamically, links to the project, issues, and API dashboard, and provides copyable diagnostics without credentials or conversation content.

## Native lifecycle

- Only position is restored by the window-state plugin. Collapsed size and hidden visibility cannot overwrite the next launch's layout.
- Position is saved after movement settles, on close, and on quit. Window bounds are clamped to the current monitor's work area after resizing.
- The native window starts invisible. Frontend initialization shows it unless Start hidden is enabled.
- Closing hides to the tray. Left-clicking the tray toggles visibility. Right-click offers Show, Refresh, Settings, About, and Quit.
- Quit saves position and exits even if saving fails. Autostart and start-hidden are independent preferences.

## Checks

Run `npm test` for the Edge/Playwright regression suite. Its Tauri fixtures exist only under `tests/`; production entrypoints do not import the harness. The suite covers repeated collapse/expand, dense layout, provider failures and recovery, empty API usage, refresh progress, About, startup preferences, movement persistence calls, and tray event routing.

Reliability coverage also includes independent provider failures, invalid/expired credentials, missing Codex CLI, backoff timing, concurrent refresh deduplication, offline/reconnect, simulated sleep/wake, negative monitor coordinates, monitor removal, and 100%, 125%, 150%, and 200% scaling. Display and power events are simulated through the native API boundary; these tests do not claim physical monitor hot-plug or OS suspend/resume certification.

Run `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` for production frontend and native checks.

Optional read-only live checks (require existing authentication and network):

```text
cargo test --manifest-path src-tauri/Cargo.toml live_usage -- --ignored --nocapture
cargo test --manifest-path src-tauri/Cargo.toml live_api_usage -- --ignored --nocapture
```

Native manual checks: move and restart; close and recover from tray; enable Start hidden and relaunch; toggle autostart and verify it; quit from both settings and tray. Restore the user's preferences after checking. A real Windows sign-in is needed to verify automatic launch end-to-end; a UI toggle test alone does not establish that.
