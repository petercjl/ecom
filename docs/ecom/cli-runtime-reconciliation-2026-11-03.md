# CLI 0.3.1 runtime reconciliation verification

The managed Skill installer compares every bundled runtime file with the selected canonical package, as well as the companion Skill and receipt. An intact same-version development candidate with different runtime bytes is stale and is replaced with a recoverable backup. Edited installations continue to stop with LOCAL_EDITS.

The actual public 0.3.0 tarball was verified against registry SHA-512 and retained as a development-only updater fixture. Local Node 24 tests passed 32 cases, including all published updater fixtures, scripts-disabled npm installation, same-version runtime drift, physical isolation, backups and edit refusal. The packed 0.3.1 candidate contains 26 files and matches source byte-for-byte; its discovery and maintenance consumer witnesses pass.

The structural auditor reports workflow gaps when invoked at this nested package root. The repository workflow `.github/workflows/ecom-cli-publish.yml` owns the macOS/Windows matrix, publish dependency and OIDC permission. Actual 0.3.0 workflow 41500611210 passed both platform QA jobs and publication. Archived-updater marker warnings are covered by executed tests rather than filename matching. Node.js 22+ remains an explicit external calling-Agent dependency; arbitrary host-managed runtime discovery is not claimed as tested.

0.3.1 was published through OIDC workflow 41503978979 after both macOS and Windows package QA passed. The public registry confirms latest=0.3.1 and SHA-512 `tfrP/KnSuOrLUCC1agShwe7vYVKI7lEfOI7+oe/R+HW11HzlmnOrWCfV6QIIFECg8xverRqOZ4BU9HymaOjbVw==`. All 26 public files match the source, global bootstrap and selected Codex isolated runtime byte-for-byte. The real 0.3.0 installed updater activated 0.3.1 with a preserved recovery backup. The current Codex host loaded its installed Skill and invoked version, capabilities, doctor and a successful native Dev container listing; its registry hash matches the browser. No other Agent installation was changed. This is current-host evidence, not a clean-context regression or a Windows native browser test.

Native browser packaging and real update acceptance remain independent gates.
