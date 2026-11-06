# Windows x64 0.1.6 build evidence

Built on physical peter-new on 2026-11-06 from committed source 78925bb3a13177bd6b6048eca19cf81b3ab4d8ce, through ecom/build-windows.mjs using Node 24.22.2 and VS 2026 Build Tools. The installed VS location is selected using vs2026_install. The final scheduled build returned exitCode=0.

The candidate contains offline Ecom help/feedback and settings/version-help destinations plus native browser update-menu notifications. It also integrates prior committed main changes. A Windows compiler bounds diagnostic in the notification arrays was corrected using std::array, after which the actual windows_update_service compilation and full native/mini_installer targets passed. Mac-only and Windows-only integration are independently compiled.

Artifacts remain on peter-new under repo/.brave-build/windows-release-j6LvXu/artifacts. Installer Ecom-0.1.6-windows-x64.exe is 250699264 bytes, SHA-256 a087396c529fd923bdfa2ca0f07b0b9182d4e51ce901a02fff0ef819012ff13f. An independent Get-FileHash comparison matched the packaging receipt. npm transport retains the existing six-part immutable layout and a 7339-byte primary. Packaging verified the payload, rejected a corrupted part and passed the actual compiled updater self-test.

The shared help page was opened and visually checked on Mac Dev using the actual Help menu; that is not a Windows desktop acceptance test. No 0.1.6 application was installed and no package was published. The installed peter-new application remains 0.1.5. Native smoke, local update/recovery, public next activation and rollback gates remain false. The new native update reminder must be accepted on the Windows candidate in the next validation cycle before stable promotion.

The separate macOS arm64 0.1.3 candidate was built from d5cc360664ca102e153d8969bab6f68f97c38bc5. Its only subsequent runtime-source difference at this checkpoint is the Windows-only array correction; macOS build evidence and signatures retain the original source identity. Later memory comparison documents do not change native inputs.
