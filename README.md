# TokenBar

A small Windows desktop widget for real Codex subscription usage and OpenAI organization API totals, built with Tauri, React, and TypeScript.

## Use

- The Windows widget includes Codex. Click Connect Codex and sign in with ChatGPT in your browser. No terminal or separate CLI installation is needed.
- Connect an OpenAI organization Admin API key in Settings for API tokens and costs. API usage is separate from ChatGPT subscription usage.
- Collapse to a small summary, use a denser expanded layout, or hide to the tray. Window position and preferences are saved locally.
- About includes version information, project links, and copyable diagnostics.

## Development

```text
npm install
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-codex.ps1
npm run tauri dev
```

Requires Node.js, Rust, and the Windows Tauri build prerequisites.

## Validation

See the [privacy statement](PRIVACY.md) for data access, credential storage, network traffic, retention, and deletion.

```text
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

The browser suite uses installed Microsoft Edge and test-only Tauri fixtures. Fixtures are never imported by the production application.

See [product behavior and native checks](docs/product-behavior.md) for lifecycle details and live usage tests.

## Release builds

See [release builds, signing, and device test gates](docs/releasing.md).
The current Windows installer is an unsigned test candidate. macOS packaging and
signed releases require the credentials and runners described there.
