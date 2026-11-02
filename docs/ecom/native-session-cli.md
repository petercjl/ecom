# Ecom 原生容器会话 CLI（macOS Dev）

## 当前能力

Ecom 原生进程支持列出既有容器，以及使用指定容器会话发送 HTTPS JSON GET。此阶段用于验证后台取数的最小通路。正常有界面浏览器保持运行，原生请求使用该容器的 `StoragePartition` 与网络服务，不创建 WebContents、导航或激活标签。

开发入口：

```sh
node ecom/cli.mjs containers list --json
node ecom/cli.mjs session get --container '<ID或唯一名称>' --url '<允许来源的HTTPS地址>' --json
node ecom/cli.mjs capabilities
```

默认连接当前工作区 Ecom Dev 数据目录；`--profile` 显式指定用户数据根目录。CLI 核对进程用户、Dev 程序路径和数据目录。`node ecom/build-dev.mjs` 增量编译并正常重启同一 Dev 实例，目前启用 `--ecom-native-cli-origin=https://sycm.taobao.com`。

## 职责与协议

- Ecom：认证本地调用、校验容器与来源、通过原生网络服务附带该容器适用 Cookie、返回脱敏 JSON。网站凭证留在浏览器中，HTTP Set-Cookie 的正常会话变动由浏览器管理。
- sycmcli：注册业务接口、校验参数、固定容器 ID、核对实例与业务返回状态。
- 调用应用：选择业务目标、日期、店铺及解释数据；用户手动完成登录和验证。

协议 v1 使用 `Default/.ecom-native-cli` 用户私有文件信箱（目录 0700、文件 0600，核对 UID、文件类型、硬链接数）。随机实例 ID 和本地认证令牌随启动产生；每笔请求使用 UUID。请求原子提交，响应包含 `schemaVersion`、`instanceId`、`operationId`。该通路没有 TCP 监听，也没有 DevTools/CDP、调试管道或任意脚本执行能力。本地认证令牌与网站 Cookie 是不同用途的凭证，均不可记录到公开材料。

`containers.list` 返回 ID/名称。`session.get` 仅接受已存在容器、配置的同一 HTTPS 来源、GET；禁止重定向，20 秒网络超时，2 MiB 响应上限，最多两笔并发。返回仅包含 JSON，敏感键脱敏；HTML、网络或 HTTP 错误以结构化错误报告。外部页面没有该本地接口权限。

命令行拒绝凭证参数。调用方使用 sycmcli 的注册操作，避免把任意 URL 当业务接口。传输成功不表示业务成功或店铺身份已确认。

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
- 没有切换其他店铺、复制 Cookie、连接旧 Chrome 或启用 CDP。

## 尚未验证与缺口

已验证 `shop.trade-summary` 的真实 Cookie-only 单店取数；双容器同一接口已通过交替与同时取数验证，见 [多容器取数测试](multi-container-test-2026-11-02.md)。平台店铺身份独立验证、其他接口适用性、更多店铺并发与跨重启恢复需继续实测。若接口需要额外 CSRF 上下文，先以实际失败证据决定最小浏览器内部扩展。Windows 通信及 ACL、完整 schema/doctor、操作查询/取消、GUI/CLI 全能力覆盖、正式安装分发仍待实现。实现不承诺浏览器退出后仍可读取 Cookie；当前由运行中的 Ecom 网络服务托管会话。
