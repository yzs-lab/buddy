# Release Guide

## Local Build

Use this for internal testing on the current Mac:

```bash
pnpm install
pnpm dist
```

Artifacts are written to `release/`. The `dist` script creates unsigned DMG and ZIP packages without publishing.

The DMG build needs electron-builder's `dmgbuild` helper. The release scripts cache it locally through `scripts/prepare-dmgbuild.sh`. By default the helper is downloaded from `npmmirror`; override `ELECTRON_BUILDER_BINARIES_MIRROR` if you want another mirror.

Run the full local verification path before sharing a build:

```bash
pnpm typecheck
pnpm test
pnpm dist
```

For an unpacked app bundle:

```bash
pnpm package:dir
```

## Signed And Notarized Build

For public distribution outside the Mac App Store, use a Developer ID Application certificate and Apple notarization credentials. Keep all credentials in Keychain or CI environment variables, never in the repo.

Recommended local setup:

1. Install the Developer ID Application certificate in the macOS login Keychain.
2. Confirm the signing identity is visible:

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

3. Export App Store Connect API key credentials in the shell that runs the build:

```bash
export CSC_NAME="Developer ID Application: Your Company Name (TEAMID)"
export APPLE_API_KEY=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
export APPLE_TEAM_ID=XXXXXXXXXX
pnpm release
```

When these credentials are present, electron-builder signs the app with the Developer ID certificate, submits it for notarization, and staples supported artifacts. The `release` script fails if a valid Developer ID signing identity is not available.

## Verification

After a signed build:

```bash
spctl -a -vv --type execute release/mac-arm64/Buddy.app
xcrun stapler validate release/*.dmg
```

Install from the DMG on a clean macOS account and run through the app's smoke path before uploading artifacts.

## Publishing

This repo currently creates release artifacts but does not upload them. Upload the generated DMG and ZIP to the chosen release host manually, or add a CI workflow and an electron-builder `publish` provider once the release host is final.
