---
name: ecom-cli
description: Use Ecom account containers for registered Shengyicanmou data reads, local mutation planning and confirmation, account inspection, native-session requests, or CLI and companion Skill maintenance. Business analysis and operating decisions belong to the caller.
---

# Ecom CLI

## Input → strategy → output

Input is an Ecom container listing/detail request, an authorized read-only endpoint plus target container, a connection diagnosis, or selected-Agent maintenance intent. The current Agent needs local command execution, file access and Node.js 22+. Output is a container list, projected account metadata, native-redacted JSON response with pinned target identity, connection diagnosis, or installation receipt with a separate host discovery check. Container names may identify accounts; disclose only within the user's request.

## Main line

1. Resolve this installed Skill's directory from the host's actual discovery record. Its bundled CLI is `.runtime/bin/ecom-cli.mjs` relative to that directory. Invoke it through an available Node.js 22+ runtime, checking host-managed runtime configuration before PATH. Canonical npm source has no `.runtime`; complete its managed installation using the packaged INSTALL.md first.
2. Read [capabilities.json](capabilities.json) and use [the generic adapter](adapters/generic.json) for any host with the required capabilities. Probe the actual entry with `version --json` and `capabilities --json`; use only declared commands and flags. A missing runtime or required capability ends with CAPABILITY_UNAVAILABLE; do not modify adapters during a task.
3. Choose the supported operation from the live schema. Use `containers list --json` to locate targets, then use a stable ID or unique exact name. Ecom must already be running in normal desktop mode; discovery validates its executable and protected endpoint. Multiple instances require an explicit intended instance/profile rather than a guess.
4. For account details, run `containers inspect --container VALUE --json`. Report platform, saved homepage and timestamped service-login status. `identityBound` records a saved binding; `identityConfirmed` requires the native ready state. Cookie expiry is a reference, not proof of current service access. Account names are labels and do not grant or remove capabilities. Credential-like homepage fields are redacted.
5. For a session request, require an explicit authorized read-only endpoint from the user or a trusted business capability’s registered operation. Business selection, endpoint semantics, date/metrics and interpretation belong to that caller. Run `session request --container VALUE --url HTTPS_URL --method GET --json`. GET alone does not prove an endpoint has no side effects; resolve unclear endpoint intent before submission. The CLI pins one instance and container across discovery and execution. Credentials remain native; header/body/credential inputs, redirects and HTML are unsupported. The enabled origin is controlled by Ecom, not expanded by the CLI.
6. Require `ok=true`, protocol version 1, operation ID and matching instance/container IDs. For requests, require the JSON response contract and distinguish HTTP success from business success: `businessStatus=not-evaluated` requires the caller’s platform-specific check. Preserve structured errors and executed status. These operations do not navigate or activate tabs.

## Registered business operations

For business data or mutation-planning requests, read [the business contract](references/sycm.md), then return to main-line target selection. The business registry is bundled with this runtime; no external sycmcli installation, Skill or browser is required. `sycm capabilities --json` exposes the complete imported catalog and native/legacy transport requirements. A registered endpoint is not proof that the current Ecom build can execute it or that its date and permission semantics have been verified. Use `sycm schema --operation ID --json` before execution. Never substitute another date to make a request succeed.

`sycm open --operation ID --container VALUE --json` is the authorized page-preparation branch: background/reuse by default, `--foreground` for explicit visible login/verification. Opening is not proof of authentication; resume the same registered read after preparation. Prefer native initialization and preserve the caller’s page-fallback preference.

`sycm run --operation ID --container VALUE --params-json JSON --json` fixes the native instance and container and validates the business envelope. Verify the returned period, platform update time and requested account before reporting metrics. A successful all-zero response is not by itself proof of zero business activity.

Mutation plan/apply commands create local records and return reviewed workflow instructions. They perform no website submission. Report `executed=false` and require actual executor and readback evidence before describing a platform change as completed. Existing authorization can cover the reviewed plan; a development request itself grants no real store mutation authority.

## Diagnosis and recovery

- BROWSER_UPGRADE_REQUIRED: update the Ecom browser and CLI together; native business protocol 1 requires matching compiled registry hashes. Preserve the account session.
- AUTH_CONTEXT_REQUIRED: keep the existing login; native service context may need adapter diagnosis even when the page is logged in. Report the gap rather than repeatedly requesting login.
- SERVICE_ADAPTER_REQUIRED: report the missing native adapter and preserve the selected container. Do not switch to CDP or another browser.
- AUTH_REQUIRED, PERMISSION_REQUIRED or RISK_VERIFICATION_REQUIRED: complete the required first-party action in this original container, then explicitly resume.
- SHOP_NOT_READY: inspect this exact account. Complete login and platform-identity verification through its Ecom account management page; a cookie expiry or account name does not satisfy readiness. If the native adapter cannot verify identity, report that gap and stop the data request. Return to step 5 only after readiness is established.
- SHOP_VERIFICATION_FAILED: stop; the browser’s pre-request identity check failed. Preserve the selected target and report the failure.
- ORIGIN_NOT_ALLOWED, CREDENTIAL_INPUT_REJECTED, METHOD_UNSUPPORTED or INVALID_URL: correct the intended input within the declared contract; do not broaden browser permissions.
- REQUEST_FAILED or NON_JSON_RESPONSE: preserve HTTP/operation/execute fields; handle login, permission or challenge through the original container. Do not infer business success.
- INSTANCE_NOT_RUNNING: run `doctor --json`. Ask the user to open a compatible Ecom version. Do not enable remote debugging or substitute another browser.
- INSTANCE_AMBIGUOUS: obtain the intended instance or profile, then return to step 3.
- INSTANCE_CHANGED: no request was submitted; rediscover before returning to step 3.
- UNSAFE_ENDPOINT, PROTOCOL_MISMATCH or BROWSER_ERROR: stop and report the exact code. Preserve browser state and request identity.
- OPERATION_TIMEOUT: retain the operation ID and report unknown completion. Inspect the instance and operation files under the protected endpoint before any retry; never blindly repeat an unknown operation.
- PLATFORM_UNSUPPORTED: report the limitation. Browser integration currently supports macOS. Windows package mechanics and generic host format are separate from actual browser support.

## Installation and update branch

Enter this branch before business calls when the user requests installation or updates. Read the selected package's INSTALL.md / UPDATE.md from its discovered source, then return to main-line step 1 after maintenance.

Resolve the current Agent's exact Skill destination from host configuration; use its actual name with the generic adapter. `skill source --json` identifies canonical bytes. `skill status --agent NAME --target PATH --json` verifies the selected target without writes. Use `skill install` or `skill update` with those declared flags for physical isolated copies; installed copies contain their own complete runtime. Installation covers both CLI and Skill; npm bootstrap success alone is partial.

For an authorized package update, invoke the installed entry's `update install --agent NAME --target PATH --yes --json`. It acquires stable latest and activates CLI plus Skill together. Use the new entry from its receipt, verify CLI/Skill versions and SHA-256 `current=true`, then refresh and load this exact Skill through host discovery. Preserve receipts and backups. Local edits and unmanaged destinations require reconciliation before replacement; other Agent installations remain untouched. Automatic task-entry checks only notify; offline checks retain the installed runtime.

Always inspect `skill status` using the newly activated entry. If `recovery.required=true` identifies legacy backups in host discovery, run the new entry's `skill update` for that same target and verify recovery clears. Backups are preserved outside the Skill discovery directory; migration records identify both old and new locations.

## QA and evolution

Success requires actual structured CLI output, not inferred browser state. Maintenance additionally requires integrity plus native host discovery. Runtime checks do not claim clean-context regression or other Agents/OS tests. Add new commands to the browser capability layer, CLI schema, tests and this canonical Skill together in an authorized development cycle. This simple deterministic Skill uses direct internalization of user-confirmed scope and verified CLI contracts; private knowledge bases are not runtime dependencies.
