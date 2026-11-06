# Ecom Windows x64 0.1.4 candidate

Native source: 547fd6b585f8e9f77e3e2244a3d834787830645b.

The native browser framework is byte-identical to 0.1.3 (SHA-256 06fc12e580b4cb5d1774c418ecf8110ff89666d2b03bfc0b16ba095f68c46fb1); its separately verified symbols remain applicable. The update helper and embedded release identity changed. This candidate adds a shared installer-liveness check for EcomSetup, mini_installer and setup before application/recovery operations. Recovery stays deferred while an installer wrapper remains alive, including a timeout before an internal setup child appears. Menu dispatch and progress-window behavior retain the 0.1.3 correction.

Built on peter-new using committed source. Installer size: 250653184 bytes. Packaging self-test, six-part payload reconstruction and corrupted-part refusal passed. A separately compiled harmless EcomSetup.exe process reproduced the wrapper-name case without modifying any application or Profile: the production guard rejected recovery while it lived, then passed after that owned fixture exited. The guard test returned zero.

Full local update/recovery and operator GUI acceptance for this exact candidate are pending. nativeSmokeTest=false, localUpdateRecoveryVerified=false, updateRoundTripVerified=false and rollbackRoundTripVerified=false; publication is blocked by the existing gates. next remains 0.1.3 and latest remains the bootstrap tag at this checkpoint. The operator's 0.1.3 prepared download is retained while menu/progress/deferral feedback is pending.

Artifacts: windows-release-hAJ9FR/artifacts on peter-new. The candidate has not been installed or published. Continue with the operator's menu/progress feedback and explicit restart readiness, verify this candidate's local update/recovery, then publish next and complete real GUI update/rollback before latest.
