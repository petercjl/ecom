# Ecom Windows x64 0.1.4 candidate

Native source: 547fd6b585f8e9f77e3e2244a3d834787830645b.

The native browser framework is byte-identical to 0.1.3 (SHA-256 06fc12e580b4cb5d1774c418ecf8110ff89666d2b03bfc0b16ba095f68c46fb1); its separately verified symbols remain applicable. The update helper and embedded release identity changed. This candidate adds a shared installer-liveness check for EcomSetup, mini_installer and setup before application/recovery operations. Recovery stays deferred while an installer wrapper remains alive, including a timeout before an internal setup child appears. Menu dispatch and progress-window behavior retain the 0.1.3 correction.

Built on peter-new using committed source. Installer size: 250653184 bytes. Packaging self-test, six-part payload reconstruction and corrupted-part refusal passed. A separately compiled harmless EcomSetup.exe process reproduced the wrapper-name case without modifying any application or Profile: the production guard rejected recovery while it lived, then passed after that owned fixture exited. The guard test returned zero.

Full local update/recovery passed 0.0.0 → 0.1.4 → 0.0.0 with the existing Profile and ordinary visible windows. The task EcomLocalRoundtrip014 exited zero; updater-validation-014/roundtrip.json reports ok=true, candidateVisibleWindow=true, containerIdentitiesPreserved=true, preparedUpdateReuseVerified=true and guiJobPidVerified=true. The test entered the production apply path with an installation-directory current directory and asserted automatic removal of the successful payload. Final independent inspection confirmed restored source 0c0b3a8672cbf2373d2dfac69e412382583e8c5b, a normal restore-last-session process and owned counts staging=0, workers=0, replaced=0, backups=1. No ready record remains.

nativeSmokeTest=true and localUpdateRecoveryVerified=true permit next publication. Exact-candidate public npm activation, operator Later/reopen and GUI rollback remain pending. updateRoundTripVerified=false and rollbackRoundTripVerified=false keep latest blocked. next remains 0.1.3 and latest remains the bootstrap tag at this checkpoint.

Artifacts: windows-release-hAJ9FR/artifacts on peter-new. The candidate has been installed and rolled back only through the local maintenance test. Publish the same immutable candidate to next, verify public registry integrity and readable payloads, then complete operator GUI update/rollback before latest. Installers remain on peter-new and authorized NAS; temporary Actions transfer artifacts are deleted after use.

## Public next verification

[Actions run 42156410645](https://github.com/petercjl/ecom/actions/runs/42156410645) succeeded through the committed OIDC workflow. Public next resolves to 0.1.4; latest remains 0.0.0-bootstrap.1. On peter-new, actual .NET metadata and body requests verified all seven immutable versions against the pinned integrity values and returned HTTP 200 with readable content. Registry metadata preceded several file bodies; the workflow retained the original identities and waited for all files before exposing the primary release. Temporary Actions artifact count is zero. The temporary Windows single-file server and HTTP/2 relay were stopped and their sessions reaped.

The local maintenance round trip leaves the verified 0.0.0 test baseline installed with original sessions restored. Operator GUI download/background/reopen, Later/prepared reuse, explicit npm activation and rollback for this exact 0.1.4 candidate remain pending. Both stable rollout gates remain false.

## Operator background and deferred preparation

The operator confirmed the requested next 0.1.4 download, minimize/menu reopen and Later/menu reopen sequence. Independent inspection found a ready record for source 547fd6b585f8e9f77e3e2244a3d834787830645b with matching npm integrity, complete installer SHA-256, canonical application and original Profile binding. The installed version remained 0.0.0 and the root browser process remained PID 41732 with ordinary session-restoration arguments. No apply worker or installer was active. Deferred preparation is verified; explicit restart activation and GUI rollback for 0.1.4 remain pending.

## npm activation and restart latency investigation

After the operator clicked Restart, independent inspection confirmed installed version 0.1.4/source 547fd6b585f8e9f77e3e2244a3d834787830645b, matching EXE/framework/updater hashes, pending=complete and last-result=updated. The ready record is absent. Automatic cleanup left staging=0, replaced=0 and backups=1; one exited copied worker remains eligible for the next updater-start cleanup. No current update failure was recorded. The operator reported a long wait before the browser appeared; restored windows/container acceptance and exact-candidate GUI rollback remain pending.

Observed local timestamps on 2026-11-06 (Asia/Shanghai): worker/job creation 11:59:11.771; backup directory creation 11:59:14.646; last root backup entry creation 11:59:49.623; browser process creation 12:00:38.152; native readiness receipt 12:00:39.041; completion 12:00:49.494. Approximately 86.4 seconds elapsed before process launch, including approximately 35 seconds copying/verifying the old application and 48.5 seconds from the last root backup entry to browser launch. These are filesystem/process observations, not instrumented per-stage timings. The helper's ten-second stability check follows window readiness and does not hold back window display.

The retained backup totals 1391410495 bytes. Its Installer/chrome.7z alone is 691500900 bytes, alongside chrome.dll at 478247424 bytes. The production path copies and verifies the entire installation while the browser is closed, then runs a full installer without a visible installation-stage progress window. This explains substantial post-click downtime and identifies redundant archive handling as an optimization investigation. No installed archive was deleted: uninstall/repair/installer requirements must be checked before changing backup coverage or cleanup. Stable rollout remains blocked pending acceptance and resolution of this latency report.
