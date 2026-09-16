# TokenBar privacy statement

Applies to TokenBar 0.1.0. Updated September 16, 2026.

## What TokenBar reads

- **Codex:** the installed CLI version, quota percentages, quota window durations and reset times, subscription plan, lifetime token count, and peak daily token count. TokenBar invokes the documented local `codex app-server` interface using `initialize`, `account/rateLimits/read`, and `account/usage/read`. The CLI may return additional account fields and daily activity buckets; TokenBar discards those before passing data to the widget. TokenBar does not request threads, messages, prompts, files, or conversation content.
- **OpenAI API:** organization input/output token counts from `/v1/organization/usage/completions` and USD costs from `/v1/organization/costs`, covering the last 30 days. Connecting a key checks `/v1/organization/projects` for admin access; that response body is not read or stored. The API key is sent only as an authentication header to `https://api.openai.com`. Redirects are disabled.
- **Device state:** window position, current monitor/work area for keeping the widget on screen, and OS autostart status. The widget reads its own preferences and app/runtime versions for diagnostics.

## What is stored, and where

| Data | Location and retention |
| --- | --- |
| OpenAI Admin API key | Windows Credential Manager or macOS Keychain, service `tokenbar`, account `openai-admin-key`, until you disconnect. No plaintext file, environment-variable, browser-storage, or fallback store is used. API credential storage is disabled on other operating systems. |
| Key while entering or requesting | Temporarily in process memory. The input is cleared after each save attempt and on leaving the connection screen. Saved keys are never returned to the frontend. Memory is not guaranteed to be immune from OS paging, crash dumps, or inspection by privileged software. |
| Usage values and safe error status | In application memory for the session. Last successful values remain available after a failed refresh with a stale label and their original timestamp. They are not persisted across app restarts. TokenBar does not maintain a usage database or write usage logs. |
| Preferences | Webview local storage under `tokenbar-settings`, in the operating system's app webview profile. Only named preference fields are saved. |
| Window position | `.window-state.json` in Tauri's app configuration directory: `%APPDATA%\com.tokenbar.app` on Windows, `~/Library/Application Support/com.tokenbar.app` on macOS. |
| Autostart preference | Managed by the OS through Tauri's autostart plugin. |
| Copied diagnostics | Your system clipboard, only after you click Copy diagnostics. Includes versions, provider states, refresh times, selected preferences, and fixed error categories. Excludes keys, raw headers, response bodies, account identifiers, and usage totals. Clipboard history/sync follows your OS settings. |

The Codex CLI independently manages its sign-in credentials, configuration, local files, and network activity. TokenBar neither reads its auth files directly nor changes its credential-storage settings. The native-keychain guarantee above concerns keys saved by TokenBar, not storage decisions made by another application.

## Network traffic and sharing

TokenBar has **no application backend, analytics, telemetry, or automatic diagnostic uploads**. Retrieved usage is processed and displayed locally; TokenBar does not forward it to another service. It still makes authenticated requests to OpenAI to retrieve that usage. OpenAI receives those requests and ordinary connection metadata such as IP address; its handling is governed by its policies. Codex app-server makes its own provider connections using the existing CLI sign-in.

Project, issue-report, and API-dashboard links open your browser only when clicked. TokenBar does not attach diagnostics or usage to those URLs or submit issue reports for you. If you paste copied diagnostics elsewhere, that is a separate disclosure you control.

A future TokenBar backend would require an intentional implementation change and an updated privacy statement before release; none exists in this version.

## Public interfaces and safeguards

TokenBar uses the [documented Codex app-server interface](https://learn.chatgpt.com/docs/app-server) and [OpenAI organization APIs](https://platform.openai.com/docs/api-reference/usage). It does not scrape ChatGPT, access browser cookies, or call private/undocumented ChatGPT HTTP endpoints. An unsupported CLI method is shown as unavailable; there is no private-endpoint fallback.

Network and CLI responses are size-limited. Requests have timeouts; pagination is bounded and cycles are rejected. Numeric fields are checked for valid type, range, and overflow. Unknown fields are discarded. Raw provider error text and authentication headers are not logged, displayed, or included in diagnostics. TokenBar contains no debug print statements.

## Removing data

Use **Settings → API connection → Disconnect** to delete the saved Admin API key. Uninstalling may leave OS credentials and app data behind; disconnect first and remove the app's configuration/webview data if you also want to remove preferences. Clear copied diagnostics using your clipboard controls. Codex sign-in data is managed separately through Codex.
