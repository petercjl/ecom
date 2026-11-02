# Update the selected Agent installation

User prompt: “帮我更新 @petercjl/ecom-cli 和它的配套 Skill。”

Resolve the currently selected Agent and exact Skill destination before mutation. Inspect the declared command contract and managed status. When current, reuse the verified installation; a same-version update repairs a missing or stale unedited Skill.

Run the selected Skill's isolated CLI with `update install --agent <name> --target <absolute-skill-directory> --yes --json`. It selects stable `latest` (or an explicit stable `--version`), acquires the candidate through npm with scripts disabled, stages the full runtime plus Skill, preserves the previous target as a uniquely named backup, activates and verifies hashes/version. Use the new receipt's entry. The optional global bootstrap package remains independently installed; it is not the selected Agent runtime. Refresh host discovery and load the resulting Skill before reporting completion.

Acquisition records a target-scoped operation journal and retains candidate location, requested version and previous version. For failure, inspect the journal and `skill status` before any new attempt. A directory lock, local edits or unmanaged target stops replacement. Failed rename restores the previous directory when possible and reports recovery evidence. Retain backups and candidates until an authorized cleanup. To roll back, verify a recorded backup, preserve the current target and restore that backup as an explicit maintenance action; do not overwrite user content.

Automatic checks occur only at container-list task entry, use `latest`, are throttled to 24 hours and bounded to 1500 ms. Set `ECOM_CLI_UPDATE_CHECK=0` to disable checks. An unavailable registry does not block browser reads or replace an installation. Updates affect only the explicit target; other Agents' isolated copies continue independently. External Node.js and Ecom installation remain unchanged.
