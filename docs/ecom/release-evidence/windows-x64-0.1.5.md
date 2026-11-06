# Ecom Windows x64 0.1.5 next candidate

Native source: 9eab6bd064276b64135b484f8cc6314ec7a0f30b.

## Supported installation and cache contract

Ecom distributes full npm installers with pinned package/part integrity and complete installer SHA-256. The native application, metadata and updater are independently checked after installation. Recovery retains an independently verified program backup and uninstall registration; the original User Data directory remains in place. UI and background helpers share these checks. Windows update IPC in the product CLI remains a documented capability gap; the maintenance test driver is not a product CLI.

Source inspection found that Chromium's AddChromeWorkItems already cleans the installed Installer/chrome.7z. Brave's install_worker override restored archive retention specifically for its legacy differential updates. Ecom's full-installer path does not require that old archive. The override now retains upstream cleanup and omits differential archive retention. The new backup operation skips exactly the current native-version Installer/chrome.7z; every other file, including setup.exe, is copied and SHA-256 checked. Reparse entries are rejected before exclusion. Existing backup destinations are refused. No hardlinks, shared mutable backup files or weakened package checks were introduced.

Uninstall source does not read the archive; its registered setup.exe is retained in both installed and rollback trees. Full installer replacement and file-copy recovery are the supported maintenance paths. Legacy differential-update and archive-only repair paths are not used by Ecom. The final candidate includes the currently committed main native diagnostics changes and was built from the complete committed main.

## Installation presentation

The copied worker opens an independent WinForms installation window before apply begins. Work runs off its UI thread; stage captions and elapsed time remain visible after Ecom exits. Verified backup bytes provide a determinate progress bar. Installer execution uses an animated indeterminate bar, without a fabricated percentage. Stages cover payload verification, normal browser exit, backup, installation, installed-file validation, startup, stability confirmation and automatic cleanup. During startup confirmation the window explicitly says Ecom is already running. It closes automatically after completion; closing the presentation while work is active is guarded. Failure recovery uses the same presentation and retains the existing error/recovery records.

The initiating window first displays installation preparation, then hands off to the independent worker. The new behavior belongs to the updated helper; an older installed helper remains older until its application is replaced. The local integration test runs this candidate's production apply/presentation code against the real installation. Public npm/GUI acceptance of this candidate remains a separate release gate.

## Verification on peter-new

Build artifact: E:\ecom-build-x64\repo\.brave-build\windows-release-wNoaVJ\artifacts\Ecom-0.1.5-windows-x64.exe (250588672 bytes). Update transfer archive: 250651648 bytes. The exact chrome.dll and chrome.dll.pdb pair is separately retained in windows-release-wNoaVJ/symbols; Windows SDK symchk reported zero failed files. Symbol files are outside the npm transfer. The helper self-test, six-part reconstruction and corrupted-part rejection passed. Source fixture tests verified exact cache exclusion, retained-file hashes, setup.exe preservation, unchanged source, byte progress and refusal to overwrite an existing backup. UI component tests checked download/deferral behavior, installation backup percentage, indeterminate installer progress, immediate elapsed text and the installation close guard. The native components were rendered for visual inspection.

Interactive scheduled maintenance tests used the original persistent Profile, ordinary GUI Ecom, explicit native quit events and normal session restoration, without debugging ports or headless execution. The first test passed 0.1.4 → 0.1.5 → 0.1.4, checking candidate identity, visible window, preserved container identity digests, prepared-payload reuse and wrong-Profile refusal. It asserted cache absence in both installed and backup trees, retained setup.exe, and automatic payload removal. The second test updated the restored cache-free 0.1.4 again to 0.1.5 and retained it. Both reports returned ok=true and scheduled-task exit zero.

Reports: updater-validation-015-9eab6bd06/roundtrip/report.json and activation/report.json on peter-new. These drive the production updater code; operator validation of the new actual menu/worker presentation remains pending. Stable npm activation/GUI rollback gates remain false.

## Measured timings

All measurements are on peter-new. Times below start at the new installation window's apply operation; local test payload preparation occurs beforehand, like a prepared GUI update. The previous 0.1.4 operator measurement used worker/process/file timestamps and is approximate. OS cache, background load and main-source differences are not controlled; this is a two-run operational comparison, not a benchmark guarantee.

| Step | Previous operator run | First optimized update | Cache-free re-update |
| --- | ---: | ---: | ---: |
| Verified backup | approximately 35 s | 15.28 s | 15.35 s |
| Installer execution | not separately instrumented | 22.44 s | 21.01 s |
| Installed identity/hash validation | not separately instrumented | 8.02 s | 7.96 s |
| Browser process launch | approximately 86 s | 48.61 s | 46.81 s |
| Visible window plus readiness | approximately 87 s | 49.87 s | 48.08 s |
| Stability and automatic cleanup completed | approximately 98 s | 60.20 s | 58.44 s |

Verified rollback took 26.61 s through startup confirmation. The new installed application totals 699927003 bytes and the retained 0.1.4 backup totals 699890651 bytes. The earlier full backup was 1391410495 bytes, including 691500900 bytes of Installer/chrome.7z. The archive omission roughly halves the application/backup disk footprint; the compressed first-install file remains about 251 MB.

## Local validation checkpoint

Independent inspection confirmed installed 0.1.5/source 9eab6bd064276b64135b484f8cc6314ec7a0f30b, exact EXE/framework/updater receipt hashes, pending=complete and last-result=updated. Installer cache absent, setup.exe present, ready record absent. Owned counts: backups=1, staging=0, workers=0, replaced=0, verification=0; no active installer/test process remained. Product cleanup performed the file removal; the agent did not manually delete update files.

The selected runtime channel remains next. At the local checkpoint no npm publication had been performed: next was 0.1.4 and latest was 0.0.0-bootstrap.1. Installers remain on peter-new, with no GitHub installer upload. Stable promotion remains blocked pending the exact candidate's public/operator acceptance.

## Public next publication and operator validation setup

[Actions run 42166625924](https://github.com/petercjl/ecom/actions/runs/42166625924) succeeded through OIDC using the same immutable windows-release-wNoaVJ payload. No native rebuild or repack was performed. On peter-new, all seven public versions matched the pinned integrity values and actual .NET GET requests returned HTTP 200 with readable content. next=0.1.5 and latest=0.0.0-bootstrap.1. The workflow waited for npm file processing before exposing the primary version. Temporary Actions artifacts total zero; the single-file server and HTTP/2 relay were stopped and their sessions reaped.

The operator first used the installed 0.1.5 GUI to restore its existing 0.1.4 backup, confirming persistent progress and recovered windows/containers. Independent inspection confirmed source 547fd6b585f8e9f77e3e2244a3d834787830645b, pending=recovered, last-result=rolled-back, no active installer, staging=0 and replaced=0. The copied worker remained eligible for cleanup on the next updater launch. The GUI recovery timing report recorded 30.415 seconds. A private snapshot records the original Profile/container identity digests for the public update round trip.

For presentation testing on the older baseline, the exact 0.1.5 helper (SHA-256 b937c5eeca1d6e3b60cadda5e483b3aebccfd8215afb18e2e0aaf7760c98acd1) was copied to the build machine's test-evidence directory before rollback. This staged test client uses the canonical 0.1.4 application and live native PID/quit-event context; it does not overwrite the installed older helper. It allows validation of the 0.1.5 progress implementation while the original 0.1.4 application remains unchanged. It is distinct from upgrading with an unmodified older helper. Public npm download, activation and subsequent operator rollback validation remain pending; stable gates remain false.

## Public GUI activation and automatic cleanup

The old installed manual updater was closed by the operator. The staged exact 0.1.5 helper opened against the unchanged 0.1.4 application using its live native PID/quit-event and original Profile. It downloaded next 0.1.5 from the public registry. Independent prepared-state inspection confirmed the pinned primary SRI, the complete reassembled installer SHA-256, source 9eab6bd064276b64135b484f8cc6314ec7a0f30b and canonical application/Profile binding. The operator selected Restart, confirmed completion and reported a substantially better experience.

Independent post-restart checks confirmed installed 0.1.5/source 9eab6bd064276b64135b484f8cc6314ec7a0f30b and exact EXE/framework/updater hashes. pending=complete, last-result=updated, ready absent, no active apply/installer. The original container identity digest matches the pre-download snapshot (one persisted Profile). Installer/chrome.7z is absent; setup.exe remains. The actual GUI worker timing reports process launch at 45.346 seconds, visible readiness at 46.605 seconds and completion at 57.039 seconds.

Immediately after completion, staging/replaced/verification were empty and one 373107-byte worker directory remained because its executable had been running. Its timing was preserved in the build-machine evidence directory. Starting the installed updater through the normal native context-bound entry invoked the product cleanup routine: workers=0, staging=0, replaced=0 and verification=0. Exactly one 699890651-byte rollback backup remains. No update files were manually deleted. Cleanup of a just-exited worker occurs on the next updater start; large downloaded/extracted files were removed during successful activation.

Public activation is verified using the staged 0.1.5 client; the separate unmodified 0.1.4 helper upgrade path is not claimed as a presentation test. The installed 0.1.5 GUI is now open for the operator's subsequent rollback test. That post-public-activation rollback remains pending, so rollbackRoundTripVerified stays false. latest remains unchanged.

## Final published-assembly rollback and promotion eligibility

After the public GUI update, the final maintenance rollback exercised the actual receipt-matched 0.1.5 product assembly, SHA-256 b937c5eeca1d6e3b60cadda5e483b3aebccfd8215afb18e2e0aaf7760c98acd1. The --rollback-published test mode copies that helper outside Application, verifies its hash and loads its production RunApplyWithProgress/restore implementation; it does not substitute a newly built updater. It verifies the installed source/core hashes before recovery, the expected 0.1.4 backup, a normal visible restored window, retained container identity digests, pending=recovered, last-result=rolled-back and automatic staging/worker/replaced cleanup. EcomPublic015RollbackFinal returned zero; its report is ok=true, publishedAssemblyExecuted=true and containerIdentitiesPreserved=true. Recovery and startup confirmation took 26.582 seconds. This final run is automated maintenance verification; the earlier operator GUI rollback remains separately recorded.

All candidate update/recovery gates now pass. The user authorized promotion of this same immutable 0.1.5 version to latest. A final local activation restores the test machine to the already verified candidate after recovery. No new browser compilation or npm payload repack is required. Later main commits contain separate native memory work, so channel promotion uses the frozen codex/windows-015-latest release checkout based on the original verified publication inputs plus QA records. Those later native changes are not included in this release. Registry promotion and final test-machine state remain to be recorded after completion.

## Final local state and first stable-promotion attempt

The final activation restored 0.1.5 from the same pinned local payload after the successful public rollback. Report promotion/activation/report.json returned ok=true, candidateVisibleWindow=true and containerIdentitiesPreserved=true. A separate installed-file check matched source 9eab6bd064276b64135b484f8cc6314ec7a0f30b and all three core hashes. pending=complete; ready and Installer/chrome.7z absent; workers/staging/replaced/verification=0, backups=1, no active apply processes. The test installation keeps runtime channel next.

[Promotion run 42171272706](https://github.com/petercjl/ecom/actions/runs/42171272706) validated the frozen source and downloaded/verified the already published immutable payload, then failed only at npm dist-tag authorization. The registry returned HTTP 403: “This trusted publisher cannot manage dist-tags.” It specifically requires Allow npm dist-tag on the existing Windows package Trusted Publisher. The action's temporary binary artifact was deleted (artifact count zero). No version or payload was republished and latest was not changed: next=0.1.5, latest=0.0.0-bootstrap.1 at this checkpoint.

Chrome reached npm's Security Key/passkey authentication. The account holder must complete proof of presence and enable/save Allow npm dist-tag on the existing petercjl/ecom, ecom-windows-publish.yml Trusted Publisher, retaining Allow npm publish. Normal publication remains GitHub Actions OIDC; no local publication, write-token fallback or new version is used. Once that account setting is saved, retry the same immutable 0.1.5 promotion from codex/windows-015-latest and verify both public tags and integrity.

## Stable-promotion retry

[Retry run 42176430162](https://github.com/petercjl/ecom/actions/runs/42176430162) on 2026-11-06 again verified the existing 0.1.5 payload and failed at the same npm E403: the Trusted Publisher cannot manage dist-tags and requires Allow npm dist-tag. Public registry verification still shows next=0.1.5 and latest=0.0.0-bootstrap.1. Temporary Actions artifacts total zero. No native rebuild, repack or version change occurred.
