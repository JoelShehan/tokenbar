#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'Build on macOS.' >&2; exit 1; }
: "${APPLE_SIGNING_IDENTITY:?Set a Developer ID Application identity}"
: "${APPLE_ID:?Set the notarization Apple ID}"
: "${APPLE_PASSWORD:?Set an app-specific password}"
: "${APPLE_TEAM_ID:?Set the Apple Developer team ID}"
[[ "$APPLE_SIGNING_IDENTITY" == 'Developer ID Application:'* ]] || { echo 'A Developer ID Application identity is required.' >&2; exit 1; }
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin --bundles app,dmg
bundle=src-tauri/target/universal-apple-darwin/release/bundle
codesign --verify --deep --strict --verbose=2 "$bundle/macos/TokenBar.app"
spctl --assess --type execute --verbose=2 "$bundle/macos/TokenBar.app"
xcrun stapler validate "$bundle/macos/TokenBar.app"
for dmg in "$bundle"/dmg/*.dmg; do
  xcrun notarytool submit "$dmg" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
  (cd "$(dirname "$dmg")" && shasum -a 256 "$(basename "$dmg")" > "$(basename "$dmg").sha256")
done
# Preserve executable modes, signatures and bundle symlinks when sharing the app.
ditto -c -k --sequesterRsrc --keepParent "$bundle/macos/TokenBar.app" "$bundle/macos/TokenBar.app.zip"
