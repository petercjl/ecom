# Ecom 原生容器会话 CLI（macOS Dev）

原生只读内存快照与 GUI／CLI 的共同契约见 [内存诊断 P0](memory-diagnostics.md)。该能力读取资源元数据，不发起网站请求或执行休眠。

## 当前能力

Ecom 原生进程支持列出既有容器，以及使用指定容器会话发送 HTTPS JSON GET。此阶段用于验证后台取数的最小通路。正常有界面浏览器保持运行，原生请求使用该容器的 `StoragePartition` 与网络服务，不创建 WebContents、导航或激活标签。

店铺管理通过独立内置页 `ecom://shops/` 使用；工具栏和容器菜单均有入口。网页界面与 CLI 共用 `RunShopCommand`，平台凭证留在原生容器中。该管理页当前仅在 macOS Dev 提供。

开发入口：

```sh
node ecom/cli.mjs shops manage
node ecom/cli.mjs shops platforms
node ecom/cli.mjs shops list
node ecom/cli.mjs containers list --json
node ecom/cli.mjs session get --container '<ID或唯一名称>' --url '<允许来源的HTTPS地址>' --json
node ecom/cli.mjs capabilities
```

默认连接当前工作区 Ecom Dev 数据目录；`--profile` 显式指定用户数据根目录。CLI 核对进程用户、Dev 程序路径和数据目录。`node ecom/build-dev.mjs` 增量编译并正常重启同一 Dev 实例，目前启用 `--ecom-native-cli-origin=https://sycm.taobao.com`。

## 职责与协议

### npm 产品入口

公开能力包的当前新增命令为 `ecom-cli containers inspect --container <ID或唯一名称> --json` 与 `ecom-cli session request --container <ID或唯一名称> --url <已授权只读HTTPS地址> --method GET --json`。实现复用下述原生信箱；`--instance`／`--profile` 可明确连接目标。

详情输出投影平台、首页、外观、服务登录检查时间及 Cookie 期限参考，并区分已保存身份 `identityBound` 与当前已核实身份 `identityConfirmed`。请求禁止凭证参数、请求体及自选请求头，来源必须与实例启用的 HTTPS 来源完全一致；选定实例和容器后，端点变更在提交前拒绝。客户端为原生身份核验及 20 秒网络请求保留最长 60 秒等待，超时结果未知时保留操作 ID。

成功响应的 `data` 是脱敏的平台 JSON；`businessStatus=not-evaluated` 表示调用应用仍需检查平台业务码、数据结构与授权。格式和验收见 [CLI 前两项验收](cli-inspect-session-test-2026-11-02.md)。

- Ecom：认证本地调用、校验容器与来源、通过原生网络服务附带该容器适用 Cookie、返回脱敏 JSON。网站凭证留在浏览器中，HTTP Set-Cookie 的正常会话变动由浏览器管理。
- sycmcli：注册业务接口、校验参数、固定容器 ID、核对实例与业务返回状态。
- 调用应用：选择业务目标、日期、店铺及解释数据；用户手动完成登录和验证。

协议 v1 使用 `Default/.ecom-native-cli` 用户私有文件信箱（目录 0700、文件 0600，核对 UID、文件类型、硬链接数）。随机实例 ID 和本地认证令牌随启动产生；每笔请求使用 UUID。请求原子提交，响应包含 `schemaVersion`、`instanceId`、`operationId`。该通路没有 TCP 监听，也没有 DevTools/CDP、调试管道或任意脚本执行能力。本地认证令牌与网站 Cookie 是不同用途的凭证，均不可记录到公开材料。

`containers.list` 返回 ID/名称。`session.get` 仅接受已存在容器、配置的同一 HTTPS 来源、GET；禁止重定向，20 秒网络超时，2 MiB 响应上限，最多两笔并发。返回仅包含 JSON，敏感键脱敏；HTML、网络或 HTTP 错误以结构化错误报告。外部页面没有该本地接口权限。

命令行拒绝凭证参数。调用方使用 sycmcli 的注册操作，避免把任意 URL 当业务接口。传输成功不表示业务成功或店铺身份已确认。

## 店铺配置合同

独立管理页的已验证范围与限制见 [管理页验收记录](shop-manager-test-2026-11-02.md)。

`shops create --platform taobao --name '<店铺名>'` 创建待登录容器；`shops configure --container '<ID>' --platform taobao` 为现有容器补充平台信息，保留 ID 与会话。`shops open --container '<ID>' --service sycm|qianniu|alimama` 在该容器中打开对应服务。管理页使用相同命令，创建后进入网页登录；关闭登录页后，待配置记录仍可恢复。

`shops verify --container '<ID>'` 请求平台身份。取得平台店铺 ID、账号 ID 和名称后，名称与容器名称一致时记录绑定；名称不同则返回候选身份及五分钟有效的 candidateId，待用户核对名称和账号，并通过 `shops confirm --container '<ID>' --shop-id '<候选店铺ID>' --candidate-id '<候选ID>'` 完成绑定。已绑定店铺的 `session.get` 在业务请求前重新核验，身份不符停止请求。未配置平台的既有容器保持原有行为；一个服务的身份核验不表示其他服务已经登录或获授权。

生意参谋优先兼容旧嵌入式身份格式，并支持当前固定 `/custom/menu/getPersonalView.json` 身份接口。浏览器在目标容器内取得可信同源首页的 microdata，内部处理平台所需的 CSRF 参数；该参数留在原生请求内。HTTP 200、业务码 0 和完整有效的店铺／账号／名称字段才构成身份结果。原生请求使用 Chromium 的专用 `referrer` 字段与同源 fetch 上下文；此通路不执行网页脚本、不创建标签，也不向 CLI 开放凭证输入。身份接口失败时可独立检查服务登录，保持登录状态与店铺绑定分离。

服务登录和店铺身份绑定分别核验。生意参谋固定 JSON 检查通过时显示登录已核验；具体店铺身份仍以平台身份字段核对结果为准。当前持久 Cookie 修复及真实重启验收见 [会话 Cookie 保存](cookie-persistence-2026-11-02.md)。

## 管理、平台与自动状态

`shops create|configure|update` 支持 `--home-url <HTTPS页面网址>`。`shops list` 返回生效的 `homeUrl`；`shops open --container <ID> --service home` 在该容器打开已保存首页。未设置时使用平台／用途的默认入口，现有账号的 ID 和会话保持不变。首页可独立于平台归属设置，禁止凭证 URL 及非 HTTPS 方案；已有明确服务参数（如 sycm、qianniu）继续作为固定快捷入口。GUI 的常用预设填写同一 URL 字段，用户可编辑任意页面路径。


淘宝分类中的所有账号使用相同的容器管理与服务入口；账号名称及历史用途元数据不改变能力。保存的首页独立决定“打开”的目标，淘宝服务还提供 `taobao|sycm|qianniu|alimama` 固定入口。历史 `--account-type` 参数仅用于兼容及未指定首页时的默认入口，GUI 按统一账号模型管理。自动核验依据已接入服务的真实响应；某个服务未授权或未登录不等同于整个淘宝账号退出登录。


- `shops platforms` 返回六类平台及其入口／服务和自动核验能力。平台 ID 为 `taobao`、`douyin`、`pinduoduo`、`jd`、`xiaohongshu`、`custom`。
- `shops create --platform <ID> --name '<名称>' [--icon <0..10>] [--color '#RRGGBB']` 建立独立会话。自定义平台另需 `--custom-platform-name '<名称>' --entry-url '<HTTPS网址>'`。`shops configure` 为既有未设置平台的容器补充这些信息。已配置平台不能静默更换。
- `shops open --container '<ID>' --service home` 打开该平台入口；淘宝另支持 `sycm|qianniu|alimama`。页面继续使用目标原生容器。
- `shops update --container '<ID>' [--name '<名称>'] [--icon <0..10>] [--color '#RRGGBB']` 保留 ID、会话及绑定。不同平台的同名店铺可并存，CLI 名称不唯一时使用 ID。
- `shops delete-preview --container '<ID>'` 返回目标、打开标签数和五分钟有效的 confirmationId；`shops delete --container '<ID>' --confirmation-id '<本次预览ID>'` 在目标无打开标签且无正在进行的核验时删除。确认参数是针对本次目标的明确删除授权，缺失或失效时拒绝。原生存储清理遵循已有容器引用与垃圾回收规则。
- `shops refresh` 安排后台检查；`shops list` 返回当前状态、checking、最近检查时间、认证服务和 Cookie 期限参考。生意参谋接口码 `5810` 是该服务需要登录的证据；Cookie 未到期不替代服务响应。仅注册的淘宝检查器会发起自动请求，其他平台标明尚无适配器。

`authentication.state=authenticated` 与 `state=signed-in` 表示固定服务登录检查通过；`state=ready` 才表示具体店铺身份已绑定且重新核实。固定登录检查只检查 JSON 的业务码和已知结构，交易数值不返回管理页。当前 `session.get` 的店铺身份保护继续要求 ready，登录成功本身不能绕过该保护。Cookie 参考不包含凭证值，也不承诺实际登录期限。

## sycmcli 本地开发适配

```sh
sycmcli ecom containers --ecom-cli '<Ecom工作区>/ecom/cli.mjs'
sycmcli ecom run shop.trade-summary --container '<现有容器ID或名称>' \
  --ecom-cli '<Ecom工作区>/ecom/cli.mjs' \
  --params-json '{"dateType":"recent1","dateRange":"YYYY-MM-DD|YYYY-MM-DD","device":"0"}'
```

该显式入口支持已注册 SYCM GET，固定容器 ID 并核对请求前后实例；不调用原有 managed Chrome 初始化。返回 `identityVerification: container-selection-only`，容器名称不是平台店铺身份凭证。当前是源代码开发适配，尚未发布 npm 版本。

## 错误与恢复

未知容器、外部来源和不支持的方法在网络请求前拒绝。登录、风控、权限、非 JSON、重定向及平台业务错误停止执行，用户在同一容器完成必要操作后再发起请求。CLI 等待 30 秒超时后保留操作文件并返回操作 ID、`executed: unknown`；先核查结果或操作文件，不自动重复请求。此阶段尚未提供独立操作查询/取消命令。

## 实测记录（2026-11-02）

- Mac arm64 Component 构建成功，Dev 正常重启。增量原生编译 17.39 秒（3 个构建步骤；不含工作区准备及重启）。启动参数无远程调试、无头或自动化参数；主进程无 TCP 监听。
- 实际 `sycmcli ecom containers` 列出了两个现有容器，包含用户指定的“杉居旗舰店”。
- 首次通过 `sycmcli ecom run shop.trade-summary` 请求 2026-11-01 单日数据，原生网络返回 JSON；生意参谋业务返回登录错误，平台码 5810。该次没有返回业务数据。用户在同一容器手动完成生意参谋登录后，复测同一注册接口（`dateType=recent1`，单日 2026-11-01）返回业务码 0、非空交易概况字段。第二次 CLI 进程耗时约 0.40 秒（含命令启动及两次容器查询），与第一次为同一浏览器实例、同一容器 ID。完整业务数值仅保存在本地私有证据中。
- 原生入口实测拒绝其他 HTTPS 来源、未知容器与任意 evaluate 方法，均报告 `executed: false`。
- 两店业务页面全部关闭、只保留一个新标签页时，两店同一接口仍成功返回各自原有数据；取数未打开任何业务页面。该条件与完全退出 Ecom 不同，详见 [多容器取数测试](multi-container-test-2026-11-02.md)。
- 没有切换其他店铺、复制 Cookie、连接旧 Chrome 或启用 CDP。

## 尚未验证与缺口

已验证 `shop.trade-summary` 的真实 Cookie-only 单店取数；双容器同一接口已通过交替与同时取数验证，见 [多容器取数测试](multi-container-test-2026-11-02.md)。平台店铺身份独立验证、其他接口适用性、更多店铺并发与跨重启恢复需继续实测。若接口需要额外 CSRF 上下文，先以实际失败证据决定最小浏览器内部扩展。Windows 通信及 ACL、完整 schema/doctor、操作查询/取消、GUI/CLI 全能力覆盖、正式安装分发仍待实现。实现不承诺浏览器退出后仍可读取 Cookie；当前由运行中的 Ecom 网络服务托管会话。


## 小红书 Dev 诊断

`node ecom/cli.mjs xhs probe --container VALUE --probe-target search|search-v2|self [--keyword VALUE] --json` 提供三个固定只读接口的 Cookie 请求对照，仅限普通 Ecom Dev。账号凭证由目标原生容器托管，诊断结果只报告 HTTP/业务码或成功数量；业务拒绝使用非零退出码。该入口是开发探针，尚未纳入 npm 产品能力。测试记录与适配缺口见 [小红书会话与搜索对照](xhs-session-probe-2026-11-05.md)。
