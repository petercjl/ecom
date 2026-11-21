# Ecom desktop login

## Select the operation and target

1. Use `shops open-login` for requested sign-in or eligible recovery in the [shop data workflow](sycm.md#shop-data-workflow). It can bring an Ecom window forward and submit one login-button click. For an open-only request, use `shops open` where native navigation is available. If the environment lacks an open-only command, explain the available manual action in the intended Ecom window.
2. Run `shops open-login --help --json` through the current Skill's managed CLI entry. Check for the command and its selectors. If the installed version lacks the command, follow the maintenance branch when an update is authorized. If diagnostics are needed, inspect `doctor --json` and its `desktop.available` and `desktop.version` fields. The top-level doctor result describes native mailbox connectivity, which is separate from the desktop dependency. A healthy binary check leaves desktop permissions and window availability to the live desktop call.
3. Pass the exact account name shown in Account manager. The command uses formal Ecom by default and can start it. On macOS, for an explicitly requested running instance such as Ecom Dev, use the verified profile path or current instance ID with `--profile` or `--instance`. Use `--window-id` to disambiguate windows within that instance. On Windows use the formal Ecom route; a request for explicit Dev selection is unsupported by this desktop command. An explicit instance failure stays with the requested target.
4. Run the command once. Ecom CLI resolves the account row, opens its saved homepage, verifies the active tab's container and supplies the actual button Ref to the packaged desktop runtime. It checks the resulting page before returning. Use the receipt's `channel`, `pid`, `windowId`, and, when present, `instance` to verify the target.

## Diagnose by environment and evidence

| Observation | Agent action |
| --- | --- |
| `DESKTOP_DEPENDENCY_UNAVAILABLE` | Inspect the installed Skill and selected package through the maintenance branch. Restore the pinned dependency through an authorized managed install or update. |
| macOS desktop permission refusal | Check the launching application's Accessibility permission. Ask the user to grant it in System Settings when required. Screen Recording is relevant for screenshots; this workflow uses accessibility observations. |
| Windows window unavailable or access refused | Check that the Agent runs in the signed-in user's unlocked interactive desktop and can access the Ecom window at its integrity level. A service, locked desktop or elevation prompt requires user-side recovery in the interactive session. |
| `INSTANCE_NOT_RUNNING`, `DESKTOP_WINDOW_UNAVAILABLE` or `DESKTOP_WINDOW_AMBIGUOUS` | Verify the requested instance and current accessible window. Use a verified window ID if the intended window can be uniquely identified. Ask for the window when ambiguity remains. |
| `CONTAINER_NOT_FOUND` or `CONTAINER_AMBIGUOUS` | Check the current Account manager platform, filters and exact displayed name. Resolve duplicates before opening an account. |
| `ACCOUNT_MANAGER_UNCONFIRMED`, `CONTAINER_OPEN_UNCONFIRMED`, or an ambiguous or unavailable control | Inspect the same window and current tab. Keep the operation ID, phase, error code and any desktop error code. Resume only when the target and action state are established. |

For platform-specific diagnostics, use the exact bundled runtime, preferably from `.runtime/node_modules/agent-desktop/bin/` in this managed Skill. Resolve the executable for the current Node architecture as `agent-desktop-darwin-ARCH` or `agent-desktop-win32-ARCH.exe`. On macOS, point `AGENT_DESKTOP_MACOS_HELPER_PATH` to the matching bundled `agent-desktop-macos-helper-darwin-ARCH` when invoking it directly. Use `version` to check that dependency and `skills get platform` for the installed platform's instructions. Read-only diagnostics include `permissions`, `list-windows`, and a fresh `snapshot` scoped to the verified application and window. Keep snapshots local and report only relevant, non-sensitive observations.

The package owns all desktop actions in this workflow. On macOS, the login Ref click uses the desktop runtime's physical-first headed path. On Windows at the pinned dependency version, the same flag keeps a Ref click on UI Automation. Where Windows refuses an ambiguous account-row Open Ref before delivery, the CLI can refresh that exact row and use its live bounds. Login clicks retain the form-scoped Ref on both platforms. Keep any manual handoff in the same verified container. Credentials and verification remain in the user's browser.

## Interpret the receipt

| Result | Report or next action |
| --- | --- |
| `backend-page` | The target container reached the recognized Taobao merchant host and document. `loginClick=not-attempted` means the CLI observed the backend without submitting a click. A merchant page alone does not establish platform account identity for a separate data or write operation. |
| `verification-required` | Leave the verified tab open for the user to complete verification. Resume by observing the state in that same instance and container. |
| `login-pending` or `unconfirmed` | Report that login remains unconfirmed and state whether the click was delivered. A disappearing form or `ok=true` alone is insufficient to establish backend entry. |
| `LOGIN_CLICK_FAILED` or `TAB_CRASHED` | End this attempt. If delivery is unknown, observe the tab and its container before considering any new action. If the same form still requires login after an ambiguous or failed click, hand it back to the user. |

Use the returned `loginClick`, `error.executed` and diagnostics together. Keep unknown delivery distinct from confirmed non-delivery. A new snapshot is an observation and does not authorize a second login submission.
