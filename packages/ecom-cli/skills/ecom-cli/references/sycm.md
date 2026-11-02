# Ecom business capability contract

Use this reference for registered reads and mutation planning. Inputs are the operation, exact container, business date/filters and authorized read or local plan intent. Output is structured data with operation/instance/container identity, a precise unsupported/authentication error, or a reviewed local mutation plan. Analysis, commercial decisions and actual submission are separate responsibilities.

## Read flow

1. Inspect `sycm capabilities --json` and choose the atomic operation. The snapshot includes 124 source registry operations plus 11 category/market/search endpoints from first-class functions. The 37 business descriptions are application workflows, not additional automatic APIs.
2. Inspect `sycm schema --operation ID --json`. Supply required fields through `--params-json` as an object or JSON file. Preserve parameter spelling and date semantics. Today's realtime data requires a suitable endpoint.
3. Locate the account with `containers list` and `containers inspect`; select its stable ID and intended instance. Execute `sycm run --operation ID --container ID --params-json JSON --json`, with `--profile` or `--instance` when needed.
4. Native business protocol 1 covers all 135 compiled reads: 88 SYCM GET endpoints, 30 Alimama POST reads, seven DMP reads and ten coupon reads. The browser prepares service authentication inside the selected persistent container. Browser/CLI catalog hashes must agree. Older Ecom builds can use only the 88 legacy SYCM GET reads; other reads require a browser upgrade. POST describes a registered read protocol, not a mutation.
5. `businessStatus=success` means the business envelope passed status checks. Verify period, completeness, permissions and update time separately. The browser rechecks bound shop identity before requesting. Individual endpoint live acceptance is separate from registry/transport coverage. An all-zero response alone does not establish zero business activity.
6. Preserve operation ID and executed status on failure. Inspect unknown outcomes before retry. Login, risk challenges and service authorization are completed manually in the original container. Credentials remain browser-private; no CDP or alternative browser is used.

For pagination, pin the first response instance ID and stable container ID in every subsequent call with `--instance` and `--container`; issue explicit page/pageSize reads and compose results using stable IDs. Market pageSize is limited to 20. Record termination and coverage; one page is not a full dataset. Locate categories with `category.tree` or `category.main`. These commands return API data; analysis and reports remain caller-owned.

## Mutation-plan flow

Seven workflows cover product drafts, migration, search/recommend publishing, video, materials, shop hosting configuration and price plans. Required fields, steps, exclusions and readback criteria are discoverable in `sycm capabilities`.

1. Select the verified account and gather the required payload. Check intended changes and existing authorization.
2. Run `sycm mutation plan --operation CAPABILITY_ID --container ID --params-json JSON --json`. It verifies the account and creates a private 15-minute plan, payload digest, idempotency key and confirmation code. Review the actual payload, target and impact with the user.
3. `sycm mutation show --plan PLAN_ID --json` returns metadata without the payload or confirmation digest.
4. Within authorization, run `sycm mutation apply --plan PLAN_ID --container ID --confirm CODE --json`. It rechecks instance/container/platform identity, expiry and integrity, and authorizes the plan once.
5. The result has `executed=false`, `automaticSubmission=false` and workflow/readback instructions. This preserves the source planning contract. A real executor is a separate capability; report completion only with real submission and readback evidence. Installation/testing requires no real store mutation.

Private plan state lives beneath the configured CLI state directory and is excluded from npm. Restarted instances, changed targets, expired/tampered plans, wrong codes and used plans stop authorization. Resolve the cause and review a new plan rather than bypassing checks.

## Native service context

SYCM uses its own homepage request token; Alimama uses its fixed checkAccess handshake; coupon reads use the container entry page cookie context; DMP uses container cookies and inline first-party configuration from its authenticated portal or an already-open matching container tab. DMP fallback reads configuration in a browser-owned isolated world and never opens or activates a tab. Credentials are not passed through the CLI.

`AUTH_CONTEXT_REQUIRED` can indicate an adapter-context gap even when the visible service is logged in. Preserve the existing login and report the exact failure; repeated user login is not the default recovery. `BROWSER_UPGRADE_REQUIRED` requires matching browser and CLI catalogs. Per-endpoint business permission and actual dates remain separate acceptance checks. Read parameter JSON is limited to 24 KiB; results to 2 MiB; the client waits up to 75 seconds.
