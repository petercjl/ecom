# Ecom Windows x64 0.1.3

Native source: 156676c25ea4b425c250592ad93041d825b0802c.

## Identity and changes

Built on peter-new from committed source using the established Windows x64 toolchain. Installer size is 250653184 bytes, SHA-256 5d231ba11bf544a895dc0cc0be6be29fbf6f44210193ed695eda60f8c377d4e6. The receipt pins the primary npm package, six immutable parts, whole installer and temporary transfer archive. This is a Windows updater and native-menu correction; Mac application inputs are unchanged.

The native menu retains its exit event/watcher on the UI sequence and dispatches filesystem checks and helper launch to a MayBlock ThreadPool task, carrying event-name and invocation-mode values rather than a Profile pointer. The child starts outside Application. Download progress remains visible on the initiating click; the user can minimize or close it into the tray and reopen it through the menu. Preparation, explicit restart, source/hash checks, private backup, recovery and automatic cleanup retain their existing contracts. The Windows product CLI update IPC remains a declared gap.

## Baseline and native validation

A build-only 0.0.0 baseline at 0c0b3a8672cbf2373d2dfac69e412382583e8c5b includes the corrected menu and progress behavior while retaining reading-list UI for comparison. It is not published. With the operator's normal exit confirmed, the explicit test migration verified the installer, archived prior preparation/recovery/channel metadata, created a complete application backup, installed the baseline and restarted the same Profile. Existing container identity digests were preserved; migration.json reports ok=true. The baseline is temporarily held on the stable tag until the new next candidate is public.

The production helper self-test, six-part reassembly and corrupted-part rejection passed during packaging. Full local maintenance validation passed 0.0.0 to 0.1.3 to 0.0.0 using the existing Profile, ordinary visible windows, normal exit events and the production apply/restore code. The test enters Apply with an installation-directory current directory. Prepared-state reuse, profile-boundary refusal, positive PID binding and persisted container identities passed. It asserts that successful activation automatically deleted the test payload. Final owned-directory counts: backups=1, staging=0, workers=0, replaced=0. Report: updater-validation-menu-013/roundtrip.json, task result 0 and ok=true.

Matching chrome.dll/PDB pairs are preserved separately in each run's symbols directory. Windows SDK symchk verified both baseline and candidate pairs with zero failed files. Symbols are not part of the temporary npm transfer archive.

## Operator gates

The previous operator download of 0.1.2 reached a verified prepared record, but its menu path triggered a UI-thread blocking check and its progress window hid immediately. Those observations are the regression cases for this candidate. Actual operator menu reopening, visible progress, background/foreground transitions, Later/reopen reuse, npm activation and GUI rollback are pending. updateRoundTripVerified=false and rollbackRoundTripVerified=false; latest remains blocked.

Publish only next through the committed OIDC workflow and verify exact public versions, integrity and readable files. Delete temporary Actions payloads and stop the temporary file server/HTTPS relay after publication. Installers remain on peter-new and authorized NAS, without GitHub Release installer attachments.
