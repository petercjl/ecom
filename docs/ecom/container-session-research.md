# Ecom 容器、CDP 与后台取数研究

日期：2026-11-02。本文是 [CLI 开发 PRD](cli-research-2026-11-01.md) 的实现研究与实验记录。普通持久容器和后台请求的产品目标已纳入 PRD；具体传输实现及平台兼容性按本文边界验证。

当前实施采用 PRD 的最小原生能力路线：普通有界面启动，不启用或连接 CDP、调试管道、调试端口和无头自动化入口。本文的 CDP/Worker 实验为历史可行性证据，当前阶段不运行；原生 CLI 的容器读取与请求仍需独立实现和验收。

## 结论与责任分工

采用一个 Ecom 实例管理多个普通持久容器，每个容器保存独立站点会话。业务任务固定 `instanceId + containerId + platformShopId`，通过受认证的本地入口请求对应会话，用户切换前台标签不改变任务目标。日常取数保持后台运行，人工登录、重新授权或验证在对应容器可见页面处理。

| 层次 | 职责 |
| --- | --- |
| Ecom 浏览器 | 容器与存储分区、持久会话、受认证本地通信、后台网络/执行环境、取消与操作记录；保持 Cookie 在原生会话内 |
| tbcli、sycmcli 等业务能力 | 店铺别名与稳定平台身份绑定、注册接口及请求参数、平台 CSRF/签名流程、权限与业务错误、限速、分页和数据规范化；调用 Ecom 的传输适配 |
| 上层 Agent / 业务 Skill | 选择店铺、指标和时间范围，决定采集与分析流程，处理需要用户参与的业务决策 |

最小新增产品能力是 `session request`：按明确容器发起受授权请求，自动使用该容器的浏览器会话，返回数据及结构化状态。CDP 连接属于实例通信入口；不同店铺通过容器与目标 ID 路由。CLI 对外契约不依赖当前活动标签或全局“活动店铺”。

## 现有实现与交接文档的发现

本机 tbcli `0.13.0-dev.0` 的 `browser-session.mjs` 连接 CDP 后选 `browser.contexts()[0]`；页面缺失时可能 `newPage()` 或复用空白页导航。其 DMP 逻辑已在页面内用 `fetch` 携带会话。当前角色端口区分商家/买家，属于另一种隔离职责。

本机 sycmcli 使用每店独立 Profile 与调试端口。`cdp.mjs` 的 `ensureServicePage()` 按服务 host 查找页面，缺页时调用 `/json/new`；普通页面取数使用 `Runtime.evaluate` 与带凭证的 `fetch`，显式 focus/login 路径才激活页面。这说明已有页面中的后台取数可以保持前台不变，而“仅按 host 找第一个页面”的策略需要适配多容器同站点场景。

用户提供的《SealSeek客户端-竞品分析开发交接与脚本优化-20261028.md》§7.1 描述主进程从会话分区取凭证，在内存构造 HTTP 请求，避免展示网页。§4、§13 同时指出每次请求依赖当前活动店铺，任务上下文尚未冻结；§15.1 明确其验证范围为源码与离线样本，真实账号兼容性仍待验证。这些是技术参考与待验证事项。

“无可见窗口”的实现仍需一个托管会话的后台浏览器进程。登录过期、CSRF 刷新、页面 SDK 或动态签名可能需要额外的执行环境，不能仅凭持久 Cookie 的存在判断平台访问成功。HTTP 200 也要继续检查平台业务状态和实际店铺身份。

## 传输方案

| 通道 | 适用情况 | 当前状态 |
| --- | --- | --- |
| 原生容器 HTTP | 可以通过请求与会话完成的接口；从目标 StoragePartition 获取浏览器网络能力，保留浏览器 Cookie 规则与响应更新 | 推荐优先实现，尚未完成 Ecom 产品接口及真实平台验证 |
| 后台 Worker | 能在 Worker 中执行、无需可见页面的请求与脚本 | 本轮用原生持久容器及本机服务实测通过；测试 Worker 由本机服务注册并通过 CDP 保持调试连接 |
| 后台页面 | 依赖 DOM、平台 SDK、页面内令牌或签名状态的接口 | 作为需要页面环境的通道；按 tabId/容器精确定位，后台创建，保持前台焦点；平台兼容性待测 |
| 人工交互页面 | 登录、过期、权限授权或平台风控验证 | 明确返回对应错误，暂停受影响任务，提示用户处理指定容器 |

Chromium 的 `StoragePartition` 提供 `GetURLLoaderFactoryForBrowserProcess()` 与 `GetCookieManagerForBrowserProcess()`，可作为原生实现入口，具体请求的 credentials、site-for-cookies、重定向及响应 Cookie 行为仍须验证。依据：[Chromium StoragePartition](https://chromium.googlesource.com/chromium/src/+/fb096c0011f9d50f0a264a9376420cdea9c421e3/content/public/browser/storage_partition.h)。Electron 的 [Session API](https://www.electronjs.org/docs/latest/api/session) 可作为文档所述会话网络能力的参考，Ecom 使用自身原生实现。

CDP [`Target.createTarget`](https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-createTarget) 提供后台创建参数。因此窗口切换属于目标选择、创建与激活策略需要处理的问题。现有业务 CLI 的页面查找与创建方式不能直接承担多容器路由。

## 2026-11-02 本机实验

环境：macOS arm64，既有 Ecom Dev Component 构建，内核报告 `Chrome/156.0.8078.80`，可执行文件 SHA-256 为 `180d0715d34801a6213b2bdcbd6368556e648fe29d53c225f06b94bbd30ae506`。使用专用实验 Profile、本机回环 HTTP 服务和随机生成的模拟 HttpOnly Cookie；没有复制或读取用户商家/买家 Profile 的 Cookie 数据库。

实验入口：`node ecom/experiments/container-background-probe.mjs`。当前仅验证 macOS arm64，需要既有开发产物。脚本生成独立 0700 目录及 0600 日志/结果，正常退出自己启动的实验实例，保留现场供核对。它是可复现研究实验，产品 CLI 的实现状态仍单独公开。

| 检查 | 实测结果 |
| --- | --- |
| 原生普通持久容器 | 经独立实验 Profile 的原生设置 handler 建立 A/B；两个稳定 ID 均为普通容器 ID |
| 同一实例与同一入口 | 每轮 A/B 同处一个 Ecom 进程、一个 CDP 端口，并报告同一 BrowserContext；容器通过各自 StoragePartition 隔离 |
| 同源、同名 Cookie | 两容器访问同一回环服务，Cookie 名称相同，使用 HttpOnly；页面脚本读不到该 Cookie |
| 无页面取数 | 关闭全部页面后，通过各容器 Worker 发请求；取数期间 page target 数为 0 |
| 顺序与并发 | 每轮 12 次交替请求及 2 次并发请求，重启前后共 28 次，A/B 身份均正确 |
| 重启恢复 | 第二轮服务端不再设置 Cookie；容器原 ID 和持久会话仍可使用 |
| 前台焦点 | 59 次采样保持相同前台应用，Ecom 成为前台的采样数为 0 |
| 总体验收 | 38 项断言全部通过；`result.json` 的 `ok` 为 true |

成功证据目录为忽略提交的 `.brave-build/container-background-M00VxO/`。每轮运行时端口分别为 53792 和 53870；重启后入口变化属于正常实例发现，各轮两个容器共享该轮入口。该实验中的端口不可作为产品固定配置。

另通过既有 sycmcli 对当前已运行的 `shanju` 会话执行一次注册的只读 `shop summary --date-type day`，返回 `ok: true`，耗时 0.939 秒，命令前后前台应用一致。只保存技术状态，未保存经营数值或凭证。证据在 `.brave-build/sycm-background-read-my4m3gwx/`。该检查证明当前 Chrome 会话能完成一次后台读取；Ecom 真实平台会话、准确店铺身份绑定及持续无干扰验收仍待完成。补充身份读取获得稳定 ID，但显示名精确匹配未成立，显示名不作为稳定绑定依据。

### 生命周期和实验边界

长期店铺需要普通持久容器。前置实验使用临时容器时，关闭页面后触发了原生生命周期清理，因此普通容器的持久性验证是单独进行的。前置失败现场保留在各自 `.brave-build/container-background-*` 中，不计入成功结果。

当前 macOS 无头实验未能通过第二次进程启动向已有实例转交容器启动参数。为创建测试环境，脚本在准备阶段重启自己的实验实例，利用原生会话恢复加载 A/B；正式 CLI 需要原生能力入口直接创建和打开指定容器。取数阶段每轮仅使用一个实例、一个入口。

实验容器创建通过私有设置 handler 完成，只用于该隔离实验。正式产品按 PRD 建立 GUI/CLI 共同能力层及认证入口。当前 Worker 请求依赖调试连接和实验服务注册的 Worker；该结果没有证明平台自身提供可用 Worker，也没有完成原生 HTTP 请求实现。常驻后台模式、资源占用、服务端权限、真实平台动态签名、会话更新及 Windows 行为仍待验收。

## 下一步验收

1. 建立 Ecom 受认证的原生容器与会话请求入口，复用普通持久容器；实现只读请求、响应限额、超时、取消、重定向边界及 Cookie 更新检查。
2. 由业务适配维护 `storeAlias → instanceId/containerId → platformShopId`；请求前及关键响应检查稳定店铺身份，任务执行期间固定上下文。
3. 在两个由用户分别登录的 Ecom 容器中，逐个验证注册的只读平台接口，先核对身份和服务权限，再比较数据；真实平台接口的 CSRF、签名和限速规则由业务能力维护。
4. 对原生 HTTP 无法覆盖的接口验证后台页面通道；有登录、权限或风控问题时暂停相应任务，保留原始错误类别与已取得的数据。
5. 通过 tbcli/sycmcli 的正式传输适配接入 Ecom，再验证多店铺并发、用户切换前台时的目标稳定性及无窗口干扰。保持现有业务命令与数据口径，并分别记录平台和操作系统验收范围。
