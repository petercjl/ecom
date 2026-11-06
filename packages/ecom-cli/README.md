# Ecom CLI

Agent CLI and portable Skill for the Ecom desktop browser. List existing containers, inspect a selected account’s platform/homepage/login status, and perform explicitly authorized HTTPS JSON GET operations through that container’s native session, preserving the active tab. Ecom must already be running in normal desktop mode. The browser transport currently supports macOS; Windows browser integration is not implemented.

## Install

Send to your current Agent:

> 帮我安装 @petercjl/ecom-cli，并安装它的配套 Skill。

The Agent needs local Node.js 22+ and terminal/file access. Installation includes the CLI and an isolated copy of the Skill in that Agent's own resolved Skill directory. See [INSTALL.md](INSTALL.md) for the bootstrap contract, including installation with npm scripts disabled.

## Use

> 用 Ecom CLI 列出我当前的浏览器容器。

> 用 Ecom CLI 查看指定账号的平台、首页和登录核验状态。

> 用 Ecom CLI，通过指定账号请求我提供的只读接口地址。

Provide the account name or stable container ID. For requests, supply an authorized read-only HTTPS endpoint or a trusted registered business operation. The browser permits only its explicitly enabled origin, rejects redirects/HTML and unsupported methods, and retains credentials in its native session. Native account readiness and identity checks remain authoritative. An HTTP 200 JSON response is transport success; the caller evaluates business success.

Container names may identify accounts. Use a trusted Agent and share results intentionally. Installing the plugin does not authorize website operations, cookie export or account modification.

## Update

> 帮我更新 @petercjl/ecom-cli 和它的配套 Skill。

Task entry checks stable `latest` at most daily, with a 1.5 second bound. Detection only notifies; updating requires authorization. An offline check retains the installed runtime. Each selected Skill contains its own complete CLI runtime; activate the entry returned by the installer. Other Agents remain independent. See [UPDATE.md](UPDATE.md).

## Developer contract

`ecom-cli help --json`, `version --json`, `capabilities --json`, `schema --json`, and `doctor --json` expose supported commands and versioned results. Errors use JSON with stable codes; exit code 2 means invalid arguments, 1 means operational failure. stdout contains results; stderr contains diagnostics. Multiple Ecom instances require explicit `--profile` or `--instance` selection. Connection authenticates through owner-only local mailbox files, verifies the live Ecom executable, and uses no remote debugging port.

The browser owns sessions, containers and authorization. This package owns discovery, read-only transport and managed installation. The Skill documents invocation, diagnosis and recovery. Additional browser capabilities will extend this same command/Skill contract.

## 业务能力迁移（开发中）

内置 sycmcli 0.4.0 的取数目录和 7 类填数计划。135 个取数入口统一使用固定原生目录，覆盖生意参谋、万相台、达摩盘与消费券。原生层在指定持久容器中准备服务认证并发送已登记的 GET／POST 读取，要求浏览器与 CLI 目录哈希一致。目录接入与逐项真实验收分别记录；旧浏览器兼容 88 个生意参谋 GET 入口，其余提示升级。填数支持计划、审查与确认，实际提交和回读由独立执行能力承担。

发给当前 Agent：

> 使用 Ecom CLI，查看指定账号可以查询哪些生意参谋数据。

> 使用 Ecom CLI，获取指定账号昨天的交易概况。

> 使用 Ecom CLI，为指定账号生成商品草稿的操作计划，供我审查。

开发者通过 `sycm operations`、`sycm schema --operation ID`、`sycm run --operation ID --container VALUE --params-json JSON` 发现和调用原子取数能力；`sycm mutation plan/show/apply` 承接计划与确认。所有命令均支持结构化 JSON。

取数优先使用后台原生请求。需要准备平台会话时，当前 Agent 可通过 `sycm open --operation ID --container VALUE` 在该容器打开注册入口，默认后台打开或复用；`--foreground` 用于明确需要前台的登录与验证。登录完成后继续调用原生接口，保留账号已设置的首页。
# Memory diagnostics (P0)

`ecom-cli memory status|tabs|processes|containers --json` returns one complete native snapshot, including effective policy, process memory, estimated tab/container shares and separate freeze/discard reasons. Select an exact `--instance` or `--profile` when more than one browser is running. Requires a browser advertising `memorySnapshotProtocol: 1`; macOS is the currently verified transport. No tabs are navigated, frozen or discarded. Shared processes are counted once; estimates are not reclaimable bytes. Unknown metrics are null and incomplete totals are identified. Origins exclude URL paths and queries; labels and titles remain user data. All four views preserve the full snapshot for consistent relationships. Windows GUI sampling is implemented separately and awaits native validation.

## Manual tab sleep MVP

`tabs discard|wake --tab ID --container ID --expected-page-version VERSION --instance INSTANCE --json` explicitly releases or reloads one selected page in its original container. Obtain exact identities from a fresh memory snapshot; use `@default` for the default session. The native layer rechecks protections and a 30-second recent-use window; there is no force override or automatic sweep. Wake runs in the background and reports navigation start, not login/load completion. Query `memory operation --operation-id UUID --instance INSTANCE --json` after uncertain outcomes; missing records mean unknown execution. Records cover the latest 128 actions per profile until restart. Requires `manualTabMemoryProtocol=1`. Persistent account storage is retained; general Agent task leases and automatic sleep remain future work.

### Automatic idle sleep

`memory auto status` reports persistent settings and run-local scan/discard counters. With explicit configuration intent, `memory auto set --enabled on --idle-seconds 1200 --instance ID --json` enables a 20-minute threshold; `--enabled off` stops future scans. Supported idle thresholds are 60–86400 seconds, scans run every 30 seconds and discard at most one eligible background tab. Original container storage stays intact and wake reloads the page.

Snapshots expose each tab's `automatic` idle time, protection reasons and `keepAwake`. Use `tabs protect --tab ID --container ID --expected-page-version VERSION --keep-awake on|off --instance ID --json` around page-backed tasks outside native integration. Protection lasts until release, tab close or browser restart and does not wake sleeping tabs. Task cleanup releases it using a fresh target version. Edited forms, before-unload handlers, media (including muted video), uploads and integrated native tasks have shared automatic/manual guards. Unknown business state requires explicit keep-running protection. Settings/exception requests have idempotent desired state; after an unknown outcome read settings/snapshot before retrying. Windows native transport remains unverified.
