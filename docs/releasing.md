# TokenBar release procedure

## Current release status

0.1.0 is a release candidate, **not production-ready**. Product name is TokenBar;
publisher is Yowel Shehan Alahakoon; bundle identifier remains `com.tokenbar.app` to preserve
existing app storage identity. Tauri warns about the `.app` suffix; changing it now
requires a tested preferences/window-state migration. Do not change it for a patch upgrade.
The original icon source is `assets/tokenbar-icon.svg`; regenerate with
`npm run tauri icon -- assets/tokenbar-icon.svg`.

The local Windows installer is unsigned. No signing credentials, second Windows
machine, or Mac were available during this work. The macOS workflow and signing
scripts are prepared but have not been executed. A successful build alone does
not satisfy the release gates below.

## Build Windows

Use Windows with Node 22, Rust stable, Visual Studio C++ build tools, WebView2,
and Windows SDK SignTool. Run `npm ci` first.

```powershell
# Internal testing only
./scripts/release-windows.ps1 -Unsigned

# Public candidate: certificate/private key must be accessible to SignTool.
$env:WINDOWS_CERTIFICATE_THUMBPRINT = '<certificate thumbprint>'
./scripts/release-windows.ps1
```

The signed path fails if either executable lacks a valid timestamped signature.
Use a trusted publisher certificate or signing service; a self-signed certificate
does not establish trust on customers' machines. Service-specific signing may
require replacing the certificate configuration with Tauri's `signCommand`.
Output: `src-tauri/target/release/bundle/nsis/TokenBar_0.1.0_x64-setup.exe`
and adjacent SHA-256 checksum. The NSIS installer is per-user and prevents downgrades.

If development cannot replace `target/debug/tokenbar.exe`, choose **Quit** from
the running widget's tray menu before rebuilding. Closing the widget hides it.

## Build macOS

On a Mac with Xcode command-line tools, Node 22, and Rust stable:

1. Install a Developer ID Application certificate in Keychain, or provide
   `APPLE_CERTIFICATE` (base64 P12) and `APPLE_CERTIFICATE_PASSWORD` through CI secrets.
2. Set `APPLE_SIGNING_IDENTITY`, `APPLE_TEAM_ID`, `APPLE_ID`, and `APPLE_PASSWORD`
   (Apple app-specific password). Never commit these values or paste them into chat.
3. Run `npm ci`, then `bash scripts/release-macos.sh`.

Outputs are a universal Intel/Apple Silicon `.app` (also zipped to preserve bundle
metadata) and `.dmg` under `src-tauri/target/universal-apple-darwin/release/bundle`.
The script verifies signing, Gatekeeper assessment, and notarization tickets.
It requires macOS 12 or newer. No macOS artifact can be validated on this Windows host.

See the official [Windows signing guide](https://v2.tauri.app/distribute/sign/windows/)
and [macOS signing guide](https://v2.tauri.app/distribute/sign/macos/).

## CI

`.github/workflows/release.yml` is manually dispatched and uploads candidates only;
it does not publish a release. Configure the `release` environment with protected
branches/reviewers and the secret names above. Windows needs a trusted self-hosted
runner labelled `tokenbar-signing`, with its signing identity provisioned. macOS
uses a hosted runner. Do not dispatch untrusted code with signing access.

Keep `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, Cargo.lock's TokenBar
package, and `src-tauri/tauri.conf.json` versions aligned for every release.
Keep publisher, product name, and bundle identifier stable across upgrades.

## Required release evidence

Record OS/build, hardware, display scales, installer SHA-256, result, and tester
for each row. **All rows remain pending until performed on the packaged app.**
Use disposable test accounts/VMs for lifecycle tests and synthetic credentials.

| Test | Expected result | Evidence/status |
| --- | --- | --- |
| Second clean Windows machine | Downloaded signed installer has correct publisher; install as standard user; correct icon, name and version; launches without dev tools | Pending |
| Windows missing WebView2 | Installer provisions runtime or explains failure cleanly, including offline case | Pending |
| Windows uninstall/reinstall | Quit first; uninstall removes binaries/shortcuts; reinstall starts; document actual preference/key retention; no orphan autostart entry | Pending |
| Upgrade from previous signed version | Install in place; one uninstall entry; preferences, saved key, position and autostart preserved; no duplicate process | Pending (needs baseline installer) |
| Downgrade | Older installer refuses replacement | Pending |
| Real Mac | Download DMG through browser (retain quarantine); Gatekeeper accepts; drag to Applications; icon/version correct; launch on Apple Silicon and Intel as supported | Pending |
| Mac uninstall/reinstall/upgrade | Quit, replace/remove app; verify preference/Keychain retention and login-item cleanup; reconnect works | Pending |
| Packaged lifecycle | Tray show/hide/quit, start-hidden, login startup, compact/expand, About links work | Pending |
| Displays and recovery | Mixed DPI, monitor unplug/replug, sleep/wake and reconnect preserve reachable window; refresh recovers once | Pending |
| Providers | Missing CLI, expired key, zero activity and offline errors are independent and retain prior good data | Pending |

Do not claim production readiness until signed artifacts pass this matrix.
Signing improves trust but does not guarantee that every reputation warning disappears.
