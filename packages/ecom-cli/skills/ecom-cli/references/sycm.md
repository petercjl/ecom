# Ecom business capability contract

Use this reference for registered reads and mutation planning. Inputs are the operation, exact container, business date/filters and authorized read or local plan intent. Output is structured data with operation/instance/container identity, a precise unsupported/authentication error, or a reviewed local mutation plan. Analysis, commercial decisions and actual submission are separate responsibilities.

## Shop data workflow

The user supplies the shop and business question. Select the registered read that answers it and handle browser discovery, container selection and data retrieval as one task. The user is responsible for the shop signed in to that container. A normal request for the named shop's data authorizes recovery using that shop's browser-managed sign-in unless the user restricts desktop actions or sign-in. Use the account's existing saved credentials as filled by Ecom. Platform verification challenges and missing credentials require the user.

1. **Select and connect to Ecom.** Use formal Ecom by default. If the user selects Dev, use the known Dev profile or current instance ID. Use `doctor --json` with the applicable selector when discovery needs diagnosis. If the requested browser is closed, start that existing installation with its normal launcher and existing profile, then wait for native discovery. For Dev, use the launcher for the selected workspace and profile. If a build or unavailable launcher prevents startup, report the actual blocker. Keep the selected instance throughout the workflow.
2. **Pin the exact shop.** A unique exact account name or stable container ID identifies the intended shop. Preserve the selected instance throughout the request.
3. **Check sign-in and read.** For an authorized Shengyicanmou read, invoke the registered operation with `sycm run --recover-login` on macOS and Windows. The CLI checks the selected container's session first. It opens the desktop sign-in flow once when recent session evidence reports signed-out, or when the read reports an authentication failure or the known ambiguous SYCM bootstrap failure. It runs the original read after the merchant backend appears and returns its evidence. For a batch in one container, make the first call with recovery, then run the remaining reads against the same session. Omit recovery for a background-only request.
4. **Read and report.** Require a successful business response for the pinned instance, container and requested period before reporting the data. Keep startup and login mechanics in diagnostics unless they affect the result.

## Registered read flow

1. Inspect `sycm operations --json` or `sycm capabilities --json` and use the [page-based routing rules](#page-based-routing) for natural-language requests. Choose the registered operation for the requested data and time grain.
2. Inspect `sycm schema --operation ID --json`. Supply required fields through `--params-json` as an object or JSON file. Preserve parameter spelling and date semantics. Today's realtime data requires a suitable endpoint.
3. Locate the account with `containers list`; select its stable ID and intended instance. Execute `sycm run --operation ID --container ID --params-json JSON --json`, with `--profile` or `--instance` when needed.
4. Native business protocol 1 covers all 135 compiled reads: 88 SYCM GET endpoints, 30 Alimama POST reads, seven DMP reads and ten coupon reads. The browser prepares service authentication inside the selected persistent container. Route protocol 1 checks the selected route against browser policy. A CLI update can add workflows and variants backed by an existing approved route. New URLs, HTTP methods or authentication adapters require browser support. Legacy protocol 1 builds require matching catalog hashes. Older Ecom builds can use only the 88 legacy SYCM GET reads; other reads require a browser upgrade. POST describes a registered read protocol, not a mutation.
5. `businessStatus=success` means the business envelope passed status checks. Verify period, completeness, permissions and update time separately. The request uses the selected container’s current session. Individual endpoint live acceptance is separate from registry/transport coverage. An all-zero response alone does not establish zero business activity.
6. Preserve operation ID and executed status on failure. A recovery-enabled read makes a single desktop recovery attempt. If it returns pending, failed, or a verification challenge, leave the original tab available for the user and wait for sign-in before retrying the read. With background-only reads, a recent native `signed-out` check and failed SYCM initialization can return `AUTH_REQUIRED` with a pinned `recovery` target. If the user authorizes recovery separately, use [Desktop login](desktop-login.md) for that target. Handle permission denial, risk challenges and unsupported service context according to the actual error.

For pagination, pin the first response instance ID and stable container ID in every subsequent call with `--instance` and `--container`; issue explicit page/pageSize reads and compose results using stable IDs. Market pageSize is limited to 20. Record termination and coverage; one page is not a full dataset. Locate categories with `category.tree` or `category.main`. These commands return API data; analysis and reports remain caller-owned.

## Page-based routing

Use the optional `pageQuery` metadata from discovery and schema. Match the canonical page path first, allowing common separators and spacing. Otherwise look for a unique alias in context, then use business meaning and search hints to narrow candidates across the catalog. Deduplicate candidates that share a canonical path before choosing a time mode. If multiple sources still fit, ask which page or metric definition the user intends before reading. Use existing operation descriptions and schemas for catalog entries without page metadata.

- **生意参谋-交易-销售分析-交易概况** refers to the 交易总览 panel. The shop selects the container and the business input is the time period. For “获取生意参谋-交易-销售分析-交易概况昨天的数据”, resolve yesterday in the platform's reporting timezone (China Standard Time) and pass the explicit date to the daily operation listed in `pageQuery.modes`.
- For “获取最近7日，分日店铺交易概况”, resolve the reporting dates and run the daily operation once per date in the same pinned instance and container. Label each result with its requested date and report any missing days. When the period does not come back in the response, describe the date as the requested period. For an aggregate “最近7天” or an explicit calendar week, use the summary operation with the corresponding `dateType` and explicit `dateRange`. If a user specifies dates, preserve them.
- A request such as “查昨天店铺的支付金额” can match this page by meaning when the shop-wide definition is clear. Keep all available business fields returned by Ecom for each read. Select the requested figures only when presenting a result or preparing a report. Preserve missing fields and platform values as returned.

## Mutation-plan flow

Seven workflows cover product drafts, migration, search/recommend publishing, video, materials, shop hosting configuration and price plans. Required fields, steps, exclusions and readback criteria are discoverable in `sycm capabilities`.

1. Select the verified account and gather the required payload. Check intended changes and existing authorization.
2. Run `sycm mutation plan --operation CAPABILITY_ID --container ID --params-json JSON --json`. It verifies the account and creates a private 15-minute plan, payload digest, idempotency key and confirmation code. Review the actual payload, target and impact with the user.
3. `sycm mutation show --plan PLAN_ID --json` returns metadata without the payload or confirmation digest.
4. Within authorization, run `sycm mutation apply --plan PLAN_ID --container ID --confirm CODE --json`. It rechecks instance/container/platform identity, expiry and integrity, and authorizes the plan once.
5. The result has `executed=false`, `automaticSubmission=false` and workflow/readback instructions. This preserves the source planning contract. A real executor is a separate capability; report completion only with real submission and readback evidence. Installation/testing requires no real store mutation.

Private plan state lives beneath the configured CLI state directory and is excluded from npm. Restarted instances, changed targets, expired/tampered plans, wrong codes and used plans stop authorization. Resolve the cause and review a new plan rather than bypassing checks.

## Native service context

SYCM uses its own homepage request token; Alimama uses its fixed checkAccess handshake; coupon reads use the container entry page cookie context; DMP uses container cookies and its fixed read-only user-info initialization endpoint, then retains the returned request context inside the browser. Website account creation and account switching remain user/platform actions. Native data requests do not create or activate tabs. Credentials are not passed through the CLI.

Alimama dynamic modules can return templates. The browser expands only data-flow IDs returned by that registered module, through a fixed read endpoint, with a maximum of 16 flows and the same total timeout. The CLI returns the original redacted `data`, optional `dataFlows`, and `resolvedResponse` when expansion is needed. Failed flows are errors. Successful flows with missing template values return `businessStatus=partial` and `completeness.complete=false`; do not treat a template or missing value as business data. Missing browser expansion returns DATA_FLOW_EXPANSION_REQUIRED. Plain member configuration reads may need an explicit `bizCode` such as the service's `universalBP`; inspect business semantics rather than assuming empty parameters will succeed.

`AUTH_CONTEXT_REQUIRED` can indicate an adapter-context gap even when the visible service is logged in. Preserve the existing login and report the exact failure; repeated user login is not the default recovery. `BROWSER_UPGRADE_REQUIRED` requires matching browser and CLI catalogs. Per-endpoint business permission and actual dates remain separate acceptance checks. Read parameter JSON is limited to 24 KiB; results to 2 MiB; the client waits up to 75 seconds.

## Authorized page fallback

Prefer native reads and native service initialization. If an entry must prepare a service session and the caller authorizes page fallback, use `sycm open --operation ID --container ID --instance INSTANCE --json`. It selects the compiled first-party entry, preserves the account homepage and container ID, and opens/reuses a background container tab. `--foreground` explicitly opens a foreground tab when the user needs to log in or verify. No arbitrary URL, browser profile or JavaScript input is accepted by this command.

A navigation result is not a login check. Preserve the original target and let the platform finish loading. Use the shop data workflow for eligible browser-managed sign-in, and hand service authorization or CAPTCHA to the user in the original container. Resume the registered read after the platform sign-in or verification step. Once the service accepts a read, native requests continue without routine page opening. An HTTP/context failure does not automatically prove expiration: inspect the bounded phase/network diagnostics before attempting recovery.

### Dev signed DMP read

Use `dmp.competitor-audience` with `itemId` as a string. Optional parameters are `days` (7, 15, 30, 90), `audienceType` (purchase, browse, favorite, cart, search) and `dimension` (gender, age, consumption, city, segments). Each call reads one dimension of a rolling window. Ecom Dev must advertise `signedBusinessRouteProtocol=1`. A rejected or expired manifest requires a valid signed route from the maintainer. Report platform errors and missing chart data separately.

A reused deferred/discarded tab restores through the shared native queue. On compatible builds, `restoration` reports `navigation-started` or `navigation-queued` with the native request ID, tab ID and phase. Observe `memory restore status` or a fresh memory snapshot for completion; navigation reuse remains separate from authentication.
