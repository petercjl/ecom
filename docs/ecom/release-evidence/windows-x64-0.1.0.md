# Ecom Windows x64 0.1.0

Native source: d415bdb3230a24d96e18642712d66f3d54301192.

## Immutable release identity

The Windows x64 release was built on peter-new from committed main with Node 24.22.2, Visual Studio 2026 and Windows SDK 10.0.28000.0. The incremental native build completed in 2m43.06s. Mac Dev was compiled and restarted at the same native source in ordinary visible mode without debugging. The user confirmed the reading-list icon removal in Mac Dev.

The first-install EXE is 250644480 bytes. The npm primary package is 7334 bytes and pins six immutable payload versions 0.1.0-payload.0 through 0.1.0-payload.5, with a maximum raw block size of 50,000,000 bytes. Primary and part tarballs total 250701816 bytes. Parts use the payload tag; the complete release uses next or latest. This layout limits individual npm publication requests while preserving the complete application.

- Installer SHA-256: 9cda7237c22207acda06baa5ded825a840b90f978c6df361d1a742fb24956c59.
- Primary tarball SHA-256: 96a11ee33c81a7355c5844db6b1e4ff6600df16c984ea80574768d87f6fded94.
- Transfer archive SHA-256: 8ae1450794b400037cf5d8949ae2a54898323db054220e95911b1a82ea0169bc.
- Native Chromium version: 156.1.98.0; Ecom product/update version: 0.1.0.

The release record pins every part's exact version, size, raw SHA-256, tarball SHA-256 and SHA-512 integrity. Reassembly must produce the same installer bytes as the first-install EXE. Payloads contain only program content, manifests and licenses.

## Native and recovery validation

The production Windows updater successfully parsed the primary tarball and all six packed parts, verified their identities and hashes, reassembled the installer and verified its full SHA-256. A deliberately corrupted first part was rejected before activation. Semver, registry-origin, corrupted SHA-512, tar traversal, symlink and hardlink rejection self-tests passed. The Node release contract tests reject missing or repeated indexes, version drift, oversized parts, invalid integrity and mismatched total size.

The installed build-only 0.0.0 migration baseline (source 0daf3277501f40ce9824513ba76aea98a3dcaa69) supports the same payload-parts protocol and retains reading-list UI for comparison. It is not published. The original installation was separately backed up with per-file hash checks; User Data and session files were preserved.

The production verify, reassemble, normal-exit, install, readiness and restore implementation passed a local-payload 0.0.0 → 0.1.0 → 0.0.0 round trip on peter-new. The candidate had a visible main window stable for ten seconds. Fresh startup receipts were required for both activations. Persisted container identity digests in the one existing Profile were unchanged after update and rollback. The native report records ok=true, transport=local-payload, candidateVisibleWindow=true and containerIdentitiesPreserved=true. Reports remain under updater-validation-parts-d415 on the build machine.

The separate restoration test verified EXE, framework, metadata and updater hashes, typed uninstall registry values, and unchanged hashes of two existing user configuration files. Local restoration and real npm transport are recorded separately. All application launches used ordinary GUI mode; no CDP, debugging port or headless browser was used.

## Publication gates

Local native smoke, restoration, updater self-test, complete payload verification and corrupt-part rejection passed. The exact primary version 0.1.0 and all six immutable parts are publicly visible with the pinned SHA-512 integrity values. The next endpoint resolves to this exact primary version. GitHub Actions run [42014239489](https://github.com/petercjl/ecom/actions/runs/42014239489) published them through OIDC; its temporary binary artifact count is zero. The transfer server, SSH forward and HTTPS tunnel were closed. The user confirmed the restored baseline window and shop containers are normal. Real GUI npm update and rollback remain pending; updateRoundTripVerified and rollbackRoundTripVerified are false. latest promotion requires those registry round trips and identical immutable payload hashes. Parts are published first and the complete primary version last. Publication retries validate existing exact versions before reuse.

Windows first-install files remain on peter-new and authorized NAS storage. GitHub Actions holds only temporary transfer artifacts, deleted after the job; no installer is attached to a GitHub Release. Runtime support covers the per-user Windows x64 Ecom installation. The initial legacy installer requires a one-time migration installer to gain the updater. Full Windows product CLI update commands remain a documented capability gap.

## Real GUI activation outcome

The GUI downloaded the complete primary and six parts (250701816 bytes). An initial first-part HTTP 404 was rejected before activation; subsequent requests for all six actual files returned 200 on peter-new. The GUI-generated worker job then contained pid=null because the inherited Form.Parent property shadowed the enclosing static browser PID field. Activation attempted to inspect PID 0 and was rejected before closing Ecom or replacing files. The installed version remained the 0.0.0 baseline. Local direct-apply tests had not covered the GUI task producer. Version 0.1.0 is not eligible for latest; the repair, GUI producer regression contract, background download and deferred-ready flow are assigned to 0.1.1.
