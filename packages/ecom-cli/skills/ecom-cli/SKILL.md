---
name: ecom-cli
description: List isolated account containers in the running Ecom desktop browser, inspect its CLI connection, or install/update the Ecom CLI and companion Skill for the current Agent. Use when the user asks for Ecom browser containers or Ecom CLI setup. Website business queries and browser mutations are outside the first release.
---

# Ecom CLI

## Input → strategy → output

Input is a request to list Ecom containers, diagnose the connection, or maintain this plugin for the current Agent. The current Agent needs local command execution, file access and Node.js 22+. Output is a verified container list (stable ID and name), connection diagnosis, or an installation receipt with a separate host discovery check. Container names may identify accounts; disclose only within the user's request.

## Main line

1. Resolve this installed Skill's directory from the host's actual discovery record. Its bundled CLI is `.runtime/bin/ecom-cli.mjs` relative to that directory. Invoke it through an available Node.js 22+ runtime, checking host-managed runtime configuration before PATH. Canonical npm source has no `.runtime`; complete its managed installation using the packaged INSTALL.md first.
2. Read [capabilities.json](capabilities.json) and use [the generic adapter](adapters/generic.json) for any host with the required capabilities. Probe the actual entry with `version --json` and `capabilities --json`; use only declared commands and flags. A missing runtime or required capability ends with CAPABILITY_UNAVAILABLE; do not modify adapters during a task.
3. For normal listing, invoke the resolved entry with `containers list --json`. Ecom must already be running in normal desktop mode. Discovery validates the live executable and protected endpoint. With multiple instances, ask which instance/profile the user intends and pass the declared selector. Never choose an account from a name guess.
4. Require `ok=true`, protocol version 1, a concrete instance identity and container ID/name pairs. Return the names and stable IDs as requested. This operation reads containers without navigating pages or changing the active tab.

## Diagnosis and recovery

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
