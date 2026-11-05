# Ecom Windows x64 0.1.1

Native source: 61456ca4a68d421a17f9bb0a0af709e5d4771b69.

## Release identity and changes

Built on peter-new from committed main using the established Windows x64 toolchain. Mac Dev was compiled and restarted at the same source with its existing development data directory and ordinary GUI launch mode.

The first-install EXE is 250648576 bytes. The primary npm tarball is 7337 bytes, with six pinned payload versions 0.1.1-payload.0 through 0.1.1-payload.5; combined npm transfer is 250704913 bytes. Individual raw parts are at most 50,000,000 bytes. The first-install EXE and the reassembled updater installer are byte-identical.

- Installer SHA-256: 8036f90e6daf3d6548d4dd79f492ef7ba384bb478d2d2456014b948bd5417e50.
- Primary tarball SHA-256: cdef49df95b85002759c53ff4fd62456097f84c5c800075717beea66e2cdb960.
- Transfer archive SHA-256: f5cc5b6fd5630413efb8354d97d4c324c7ec2c6dea74ca8c67c243c2f0838bf9.
- Native Chromium version: 156.1.98.0; Ecom product/update version: 0.1.1.

The release removes the reading-list entry and adds a progress-only download view, background download with tray notifications, durable prepared-update reuse and explicit restart-or-later choices. The GUI and native tests share a typed browser-job producer; positive browser PID serialization is checked, null or nonpositive PIDs are rejected before process inspection. Prepared package metadata is compared with the SHA-512-verified primary archive before activation.

## Local validation

The actual Windows progress and ready components were rendered from production source with fixture values. Tests passed for unknown-total progress, overall percentage, downloaded/total bytes, verification state, deferral without restart and explicit restart consent. The production helper self-test passed registry-origin, semver, corrupted integrity, tar traversal/link rejection and GUI worker PID serialization checks. Native payload verification parsed all six parts, reassembled and hashed the full installer; a deliberately corrupted part was rejected.

A build-only 0.0.0 migration baseline at 3104f57560c3686b0bfd15586352a5062cbda788 contains the repaired update helper and retains reading-list UI. It is not a published product release. The original installation backup and user-data/session backups remain preserved.

The production validation, normal exit, installation, readiness and restoration code passed 0.0.0 → 0.1.1 → 0.0.0 on peter-new. The candidate had a stable visible window and fresh startup receipt. Persisted container identity digests in the existing Profile were unchanged. Before activation the test saved a prepared-update record, reloaded it from disk with identical hashes and staging path, and rejected a mismatched profile context. The same typed job builder used by the GUI supplied the correct live PID for update and rollback. Reports under updater-validation-background-61456 record ok=true, preparedUpdateReuseVerified=true, guiJobPidVerified=true and containerIdentitiesPreserved=true.

All browser launches used ordinary GUI mode with the same user-data directory, without CDP, debugging ports or headless mode. Platform login success is separate from these container metadata and application recovery checks.

## Publication and operator gates

Local native smoke, restoration, prepared-state reuse, GUI component tests and package integrity checks passed. The candidate is eligible for next. Real npm GUI background download, Later/reopen reuse, activation and rollback are pending. updateRoundTripVerified and rollbackRoundTripVerified remain false, so latest is blocked.

Publication uses the committed GitHub Actions OIDC workflow. Every immutable part must have matching public metadata and an actual readable payload body before exposing the primary version. The workflow verifies the full source-bound payload and deletes its temporary Actions binary artifact. Installers remain on peter-new and authorized NAS storage; no Windows installer is attached to a GitHub Release.

## Public next verification

[Actions run 42024465906](https://github.com/petercjl/ecom/actions/runs/42024465906) completed through OIDC. Version 0.1.1 and all six payload parts are publicly visible with their exact pinned integrity values, and next resolves to 0.1.1. Actual GET requests to each payload file returned 200 on peter-new using the same .NET HTTP stack as the updater. The Actions artifact count is zero, and the temporary server, SSH forward and HTTPS tunnel were closed. Operator background download, deferral/reuse and GUI activation/rollback remain pending; latest gates are unchanged.

## GUI activation failure

The operator downloaded 0.1.1 from next and selected restart. Recovery failed while renaming Application, with System.IO.Directory.InternalMove in the saved exception stack. A read-only process-parameters probe confirmed the copied worker retained Application/156.1.98.0 as its current directory. The original update exception was masked by the recovery exception. The running worker's error state and recovery metadata were preserved; launching the verified recovery helper outside Application with UpdateState as its working directory restored the 0.0.0 baseline. The operator confirmed windows and shop containers recovered. Version 0.1.1 remains ineligible for latest. The correction requires a new immutable native release.
