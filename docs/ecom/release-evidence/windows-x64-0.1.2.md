# Ecom Windows x64 0.1.2

Native source: c63bf0c016b294d1518eaf0f5ef7b53d78a468e3.

## Identity and scope

Windows-only updater correction, built and packaged on peter-new with the fixed Windows x64 toolchain. The native framework remains byte-identical to 0.1.1; the updater and embedded release identity changed. Mac application inputs are unchanged. The installer is 250650112 bytes with SHA-256 3d7df6a1cf551822c8d2b15304e4dea43b8d9922e7162051785d1cb1a9e3ca94. The source-bound receipt pins the main npm package, six payload parts, full installer and temporary transfer archive.

The helper releases an inherited Application current-directory handle, and all worker, installer, recovery and browser launch contexts use UpdateState. A recovery exception retains the original update failure. Successful activation automatically removes used downloads, extracted files and old backups; deferred payloads and interrupted installations remain protected, and the latest rollback backup is retained. A running worker directory is reclaimed on a later updater launch. Cleanup is restricted to updater-owned GUID directories and rejects reparse points. The Windows product CLI update IPC remains a declared gap.

## Validation

Production helper self-test, complete six-part reassembly and corrupted-part rejection passed during packaging. Isolated native tests passed for an updater launched with an inherited installation directory, renaming that directory while the corrected process remained alive, and cleanup lifecycle protection of pending recovery, deferred payloads, current worker and user data.

A direct native maintenance roundtrip on peter-new passed 0.0.0 to 0.1.2 to 0.0.0 with the existing Profile and normal visible windows. The test deliberately set its current directory to the native installation before applying. Prepared payload reuse, profile-context refusal, positive browser PID binding and persisted container identity preservation passed. After successful activation the production cleanup removed the test payload automatically. Final dedicated directory counts after rollback: backups=1, staging=0, workers=0, replaced=0. The report is updater-validation-cwd-c63bf0c01/roundtrip-v2.json, with task result 0 and ok=true.

The test baseline contains the historical updater; its notification process was explicitly exited before the maintenance test. An earlier harness attempt retained an installation-directory handle in its parent and encountered installer exit 7; its recovery state was preserved and recovered before the corrected independent-parent test. This is not an operator GUI update pass. Existing published old updaters cannot repair their own caller code through a replacement payload; this migration must use a corrected helper before testing normal future updates.

## Publication gates

Native local update/recovery and automatic cleanup passed. Real npm GUI background download, Later/reopen reuse, activation and GUI rollback remain pending. updateRoundTripVerified=false and rollbackRoundTripVerified=false; latest is blocked. Publish only next through the committed OIDC workflow, remove temporary Actions payloads, and verify exact public integrity and tag. Windows installers remain on peter-new and authorized NAS, without GitHub Release installer attachments.
