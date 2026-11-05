# Ecom Windows x64 0.1.0

Native source: a9f963cb6dc4ab193f65c3dbb8a3ca84c361e101.

The Windows x64 candidate was built on peter-new from committed main with Node 24.22.2, Visual Studio 2026 and Windows SDK 10.0.28000.0. The incremental native build completed in 2m33.65s. The first-install EXE and the installer inside the npm payload are byte-identical.

- Installer: 250642944 bytes; npm tarball: 250657918 bytes.
- Installer SHA-256: 7a6b9ac6960ac866d9168215e1a6ea1faadbb8ffca7acdec18c42389f0046f83.
- Tarball SHA-256: a61823100d93e2db21bac1a59be2b67ad414ebd22115235272c2356c66edc6e0.
- Native Chromium version: 156.1.98.0; Ecom product/update version: 0.1.0.

## Source and native validation

Mac Dev was compiled and restarted at the native source revision above, in ordinary visible mode without debugging. The user confirmed that the reading-list book icon was absent. Windows package validation and the production updater's semver, registry-origin, corrupted SHA-512, tar path traversal, symlink and hardlink rejection checks passed. The actual packed payload was parsed and its installer hash checked by the Windows updater.

A build-only 0.0.0 migration baseline (source aaea7cd907578a6fe1df93148452247b1c3d398a) includes the updater while retaining reading-list UI for comparison. It is not a public release. The pre-migration installation was separately backed up and every copied application file checked. Existing User Data and session files were preserved.

The actual installed baseline exercised production restoration code: executable, framework, updater and metadata hashes, typed uninstall registration values, and the two existing profile configuration files were preserved. A separate native test then used the production package verification, normal exit event, installation, readiness and rollback implementation for a local-payload 0.0.0 → 0.1.0 → 0.0.0 round trip. It passed on peter-new with one existing Profile, a stable visible candidate window, and identical persisted container identity digests after update and rollback. Each activation required a fresh startup receipt and a visible main window stable for ten seconds. No CDP, debug port or headless session was used.

Native logs and reports remain on the build machine under updater-validation-a9f. The round-trip report records transport=local-payload, ok=true, candidateVisibleWindow=true and containerIdentitiesPreserved=true. This is local activation evidence, separate from the npm transport test.

## Publication gates

Local native smoke, restoration, updater self-test and payload verification passed. The candidate is eligible for next. Public npm download/update and rollback are pending; updateRoundTripVerified and rollbackRoundTripVerified remain false. latest promotion requires those real npm round trips and the identical payload hash.

The runtime updater currently supports the per-user Windows x64 Ecom installation. The initial legacy Windows installer has no npm updater and requires a one-time migration installer. Complete Windows product CLI update commands remain a documented capability gap.

## Publication attempt outcome

GitHub Actions run 42010581055 passed the complete transport and identity checks and authenticated through OIDC, then npm rejected the 250657918-byte tarball with E413. Version 0.1.0 remained absent from the registry and the temporary Actions artifact was deleted. The subsequent payload-parts implementation requires a new native build and separate activation evidence.
