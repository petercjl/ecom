# Ecom 0.1.0 macOS arm64 candidate verification

Native source: `914de787f45688ba3709b4935bf04e3c74a865c0`. Ecom release version is 0.1.0; the browser engine bundle reports 156.1.98.0. Package identity is `@petercjl/ecom-macos-arm64`, application identity is `app.ecom.browser`, signing is ad-hoc and the app is not notarized. The bundle declares macOS 13.0 minimum; actual native verification covers this Mac running macOS 26.5.2 arm64 only.

## Verified artifact and installation

The real `node ecom/build-macos.mjs` entry completed successfully, preserving the Dev instance and caches. The initial Release compilation completed 28,431 tasks in 1h36m; the latest native session change required six incremental tasks. Subsequent packaging corrections reused those compiled objects. Build environment: Node 24.22.2, Xcode 26.5, SDK 26.5; GN arguments SHA-256 `b53d5ae0b98b8ddb61d930456e126c531f3cb92dc8e0cc06460afb94b82d8c31`.

The finished DMG passes `hdiutil verify`. It was mounted read-only, its Ecom.app copied to an isolated install directory, and the mounted image detached. Both the mounted and copied app pass nested strict codesign verification. The copied updater passes its actual optimized production self-test including real lipo architecture validation. The application audit passes on the entire signed bundle after Rust WASM source-path remapping; private build paths, profile files and external links are refused by the packaging gate.

- DMG: `Ecom-0.1.0-macos-arm64.dmg`, 455192417 bytes; SHA-256 `156918f6c7cbe8bbd0507ce977b5a4383373e30b2df5ede2b20ee1c1cf76e27c`.
- npm payload: `petercjl-ecom-macos-arm64-0.1.0.tgz`, 416973634 bytes; SHA-256 `5fab608d24908e82948ec9a3e0277c621ad3859d900e066169ec1acb7cdc448c`.
- Internal application ZIP: 418447229 bytes; SHA-256 `df1148b1a2791c4336fe70dd28d2d2fe892b8f453ead92ec48bc797c2fa2609b`.

DMG and npm ZIP contain the same staged application identity. The npm tarball contains exactly package.json, artifact.json, Ecom.zip and LICENSE, with no install scripts, account data or Node runtime requirement for browser users.

## Actual desktop and CLI smoke

The DMG-installed copy opened in ordinary GUI mode with the previously absent formal default data directory `Library/Application Support/Ecom/Ecom`. The existing Dev profile was not copied. The account-management GUI and the exact public CLI 0.3.1 both display the four initial native containers; these are unconfigured labels, not verified shop logins. The CLI identifies the formal process as stable and matches native business read protocol 1, page-open protocol 1 and registry hash `26d302541c1641b00ce45c6df4ae32bbb90e2b21352fe5f91e3cfedb21e35d5e`.

Normal desktop quit and relaunch restore the account-management tab and preserve all four container IDs and names. The native endpoint is re-created for a new process identity. The updater process receives the actual formal data directory. The formal browser has no remote-debugging, headless or automation launch flags and no TCP listener. The original Dev process remains running against its separate workspace profile.

## Local recovery verification

`ecom/test-macos-update-recovery.mjs` compiles the current canonical production updater definitions with a development-only test entry. It copies actual signed Ecom bundles into a new isolated directory, uses an explicitly marked 0.0.0 predecessor, activates the production bundle, verifies its signature, rolls back, verifies the restored predecessor, and verifies that a missing candidate preserves the original app. An isolated profile sentinel remains unchanged. This test launches no browser and transfers no network payload; it is separate from the real desktop smoke and from actual npm update acceptance. All nine release-contract tests pass, including byte-identical candidate promotion, transport tampering, and allowing explicitly classified verification-only changes while refusing changed production updater inputs.

Only development verification and evidence files changed after the artifact source. Production browser, updater, build recipe and payload bytes are reused; the exact source SHA and artifact hashes remain fixed.

## Publication and remaining acceptance

The browser namespace has not yet been created: the minimal separate 0.0.0-bootstrap.0 publication awaits npm security-key authentication. GitHub CLI authentication subsequently reports an invalid token and HTTP 401, so Release asset upload and Actions dispatch require login recovery. No browser package, native next/latest dist-tag or real npm update round trip is claimed. Source synchronization uses the existing SSH remote and is verified independently.

The candidate is ready for next-channel publication after authentication. `updateRoundTripVerified=false` intentionally blocks latest promotion. Full acceptance still requires actual npm download, both download/install confirmations and cancellation behavior, normal quit, replacement/relaunch, and registry integrity verification before promotion. This locally mounted DMG test does not verify a browser-downloaded file's quarantine/Gatekeeper flow. Real store login, CAPTCHA, all 135 business operations, other macOS versions, Intel Mac and Windows native operation are not established by this smoke test.

The independent CLI package 0.3.1 is public on latest, has passed macOS/Windows package QA, and its 26 public files match source, the global entry and this machine's Codex isolated runtime. Current-host Skill discovery and Dev/native metadata reads passed; details are recorded in `docs/ecom/cli-runtime-reconciliation-2026-11-03.md`.
