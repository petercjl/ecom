# Ecom CLI 产品需求（PRD）与调研依据

调研日期：2026-11-01。状态：开发 PRD。能力范围、分期、共同规则及验收顺序作为 CLI 开发基线；命令示例属于接口草案，实际 schema 与实现状态随交付公开。第三方能力依据官方仓库与文档核实，Ecom 兼容性以实际测试为准。

当前实施规则（2026-11-02）：采用按任务逐项增加功能的方式。先交付既有容器元数据读取和一个按容器绑定的最小只读请求；任务出现能力缺口时再增加对应接口。浏览器、开发重启及当前验收使用普通有界面模式，CLI 直接接入原生受控能力，当前不启用或连接 CDP、调试端口、调试管道及无头自动化入口。下方能力表用于长期规划，不要求一次实现整批功能。

## 当前交付与缺口

内存 P2 增量：`memory restore status|set` 与 GUI 共用重启按需恢复和后台恢复并发设置；`tabs wake` 支持待恢复页及有界队列，`memory operation` 回读恢复阶段。每窗口选中页直接加载，后台标签保留原容器与会话。启动、切换和后台取数的 macOS Dev 实测单独记录；通用会话导入导出、应用生命周期 CLI 及 Windows 运行验收仍待接入。

自动休眠增量：`memory auto status|set` 与 `tabs protect` 接入共享原生闲置调度、持久设置及运行期单页保持运行保护；GUI 同步提供开关、阈值与保护原因。取数、编辑、音视频等保护在执行前复核，按最多一页／30 秒调度。运行验收独立记录，Windows 仍待验证。

2026-11-06 P1 MVP：新增显式 `tabs discard/wake` 与 `memory operation`，GUI 提供同一原生能力；固定实例、容器、标签和页面版本，复核保护并保留动作记录。属于单标签手动回收与恢复，自动调度和通用 Agent 任务租约仍是缺口；当前实现与验收状态见 [内存诊断及手动休眠](memory-diagnostics.md)。

2026-11-06 增量：`memory status|tabs|containers|processes` 已接入原生只读资源快照，与账号管理中的内存页面共用能力，覆盖窗口／标签／容器归属、唯一进程内存、估算对账及冻结／卸载原因。范围和验收见 [内存诊断 P0](memory-diagnostics.md)。这不是通用标签控制、休眠执行或业务任务保护的完成记录；Windows CLI 传输仍待接入。

`@petercjl/ecom-cli` 已有容器列表；本次完成前两项增量：`containers inspect` 返回平台、首页、外观及带时间的服务登录状态，`session request` 固定实例与容器，调用原生受限 HTTPS JSON GET。配套 Skill、机器契约及浏览器安装说明同步更新。macOS Dev 已完成真实店铺身份核验和生意参谋只读接口取数，详情见 [CLI 验收](cli-inspect-session-test-2026-11-02.md)。请求的 HTTP 成功、平台业务成功与店铺身份分别校验，GET 方法本身不构成无副作用的授权依据。

后续按任务增加账号生命周期、导航和页面读取／交互、设置、下载等能力。Windows 原生浏览器连接、更多平台身份适配器、操作查询／取消及同一容器内登录切换的并发冲突验证仍在缺口中。CLI 包的 Windows 安装／升级测试与原生浏览器支持分别记录。

## 建议方向

Ecom 提供统一的 `ecom` CLI。网页控制优先验证复用现有项目的实现，容器、原生设置、窗口和实例身份通过 Ecom 浏览器进程的共同能力层提供。CLI 与桌面界面操作同一套浏览器状态，上层业务 Skill 决定电商任务与操作流程。

最小缺口是：受控的本地能力入口、既有 `containerId` 与原生容器的准确映射，以及单个指定容器的只读请求能力。先验证任务能否完成，再根据实际缺口扩展实例、页面和交互接口。

多店铺取数以同一 Ecom 实例中的普通持久容器承载各店铺登录态。业务 CLI 保存店铺别名、平台身份与容器 ID 的明确绑定；每项任务冻结上下文。常规取数在后台完成，保持用户正在使用的窗口、标签和输入焦点；登录及平台验证由用户在对应容器中完成。后台请求优先评估原生网络传输，页面运行时依赖由后台 Worker 或后台页面承接，支持范围逐接口验证。研究及初次实测见 [容器与后台取数研究](container-session-research.md)。

## GitHub 项目对照

| 项目 | 核实的能力与实现特点 | Ecom 借鉴位置 | 需适配的边界 |
| --- | --- | --- | --- |
| [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | 面向 Agent 的 CLI；snapshot/ref、JSON、CDP 连接、标签目标；当前主线为 Rust CLI 与直接使用 CDP 的 Rust daemon | 首选命令设计及页面控制实现评估对象 | 自动发现、启动、退出与会话策略改为 Ecom 的实例身份；补充容器路由与原生设置 |
| [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) | 页面快照、ref 交互、表单、文件上传、存储、截图；支持 attach CDP 及 detach | 交互、等待机制与测试验收参考，作为页面后端的备选 | 对既有 Ecom 的 CDP 连接逐项验证；自动化 context 不能直接当作 Ecom 容器 |
| [browser-use/browser-harness](https://github.com/browser-use/browser-harness) | 通过 CDP 操作已登录的真实 Chrome；支持已有 Agent，允许工作区 helper 扩展 | 复用当前登录会话、人机协作与恢复流程参考 | 经常使用的 helper 需要归入 Ecom 的正式命令、schema 与测试 |
| [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | 包含独立 chrome-devtools CLI；daemon、本地 socket/Windows named pipe、JSON；页面、网络、控制台、性能工具 | 诊断接口及本地通信设计参考 | 采用 Ecom 的认证、目标权限、文件范围和实例生命周期 |

以上项目均未归档。GitHub 报告 agent-browser、playwright-cli、chrome-devtools-mcp 为 Apache-2.0，browser-harness 为 MIT。具体复用代码前核对所选版本的 LICENSE、NOTICE、依赖与需保留的来源声明。

调研源码定位：

| 仓库 | 核实 main 提交 |
| --- | --- |
| vercel-labs/agent-browser | `5868f7c05020e047c00e68e4abf9253cce864f41` |
| microsoft/playwright-cli | `0a808078d96496cf2a8fa725143c870354f63cda` |
| browser-use/browser-harness | `0727ae724122e3f70e103f55d07c6528f60e7241` |
| ChromeDevTools/chrome-devtools-mcp | `8d009e854f8aa55b1ec31628e836d4d4731b8ec8` |

补充依据：[Playwright CDP 连接文档](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp) 明确提示，其能力完整性低于 Playwright 原生协议连接，浏览器启动参数也可能影响功能；因此“能连接 Chromium”不等于已经兼容 Ecom。Chrome DevTools 的 [CLI 文档](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/cli.md) 和 [工具参考](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md) 用于区分 CLI 与 MCP 实际暴露的命令；部分 MCP 命令未进入 CLI 生成。

## Ecom 源码依据

项目已有容器原生基础，可复用其逻辑与校验：

- `components/containers/core/browser/containers_service.h` 提供容器列举、运行时查询、临时容器创建等能力。
- `components/containers/core/browser/containers_settings_handler.h` 提供容器新增、更新、删除、排序及可编辑属性校验。
- `components/containers/content/browser/storage_partition_utils.cc` 通过 StoragePartitionConfig 的 partition domain/name 及 WebContents 附属数据识别容器。

因此需要建立 Ecom 原生容器映射，分别验证目标页面的交互、存储读取与清理。第三方的 session、profile、BrowserContext 与 Ecom 的容器具有不同职责。实现时复用或提取原生共同能力，避免把操作设置页面或修改磁盘 Preferences 当作管理接口。

## 拟议接口表

命令组统一以 `ecom` 开头。P0、P1、P2 表示长期能力清单的相对优先级；当前交付范围按上述最小任务确定。同一组内先提供最小可用操作，缺口通过能力清单明确公布。

| 优先级 | 接口组与拟议子命令 | 面向 Agent 的用途 | 适配方式 |
| --- | --- | --- | --- |
| P0 | `help / version / capabilities / schema / doctor` | 发现当前版本真正支持的命令、参数、权限及连接问题 | Ecom 统一契约，借鉴已有 CLI 的发现与诊断设计 |
| P0 | `instance list / inspect / connect / disconnect`；`app status` | 精确连接 dev 或正式实例，报告真实身份 | Ecom 原生发现与认证；disconnect 只断开客户端 |
| P0 | `window list / inspect / create / activate / close` | 列举和控制浏览器窗口 | 原生 Browser/窗口能力 |
| P0 | `tab list / inspect / create / activate / close` | 找到现有标签，并在指定容器创建标签 | 原生标签管理及 CDP target 映射；始终返回容器归属 |
| P0 | `page navigate / back / forward / reload / stop` | 打开页面、浏览导航与停止加载 | 复用页面控制实现；指定 tabId，核对容器与弹窗归属 |
| P0 | `container list / inspect / create / update` | 创建、命名、着色并查询多账号容器 | 复用 Ecom 容器能力与属性校验 |
| P0 | `tab open-in-container` | 在目标容器重新打开 URL，使用目标会话 | 原生明确操作；不迁移当前页面内存、表单或登录数据 |
| P0 | `session request` | 使用指定容器的持久会话执行后台请求，返回响应数据及操作状态 | 原生会话托管凭证；公开实际传输、授权范围与目标。平台业务 CLI 维护注册接口、参数、身份检查、CSRF/签名规则及限速；敏感解析在受控浏览器会话内执行 |
| P0 | `page snapshot / find / read` | 获取可操作元素、正文、链接、表格与属性 | 借鉴 snapshot/ref 与语义定位；带 frame 和页面版本 |
| P0 | `page click / fill / type / select / check / press / scroll / hover / drag` | 表单填写、按钮交互及页面滚动 | 评估现有页面动作复用；失效引用与目标歧义明确报错 |
| P0 | `page wait`；`dialog inspect / accept / dismiss` | 等待元素或导航；处理网页 JS 弹窗 | 条件等待；超时报告状态，不盲目重试有副作用动作 |
| P0 | `page screenshot` | 页面、元素和整页截图供 Agent 判断 | 复用网页截图；完整浏览器窗口截图单独声明支持范围 |
| P0 | `settings schema / get / set / reset` | 读取和修改浏览器配置 | 原生设置能力；首批涵盖启动行为、下载目录、外观、语言、默认搜索引擎，逐项公布读写支持 |
| P0 | `operation inspect / wait / cancel`；`events watch` | 查询命令结果，订阅导航、标签、容器和下载变化 | Ecom 操作记录与事件协议；标明取消是否仍可能留下已执行动作 |
| P1 | `upload set`；`download list / inspect / wait / cancel / reveal` | 上传文件、跟踪下载完成及定位产物 | 页面文件选择与原生下载管理结合；绑定容器、目标路径和实际文件 |
| P1 | `permission list / get / set / reset` | 管理站点摄像头、麦克风、通知等权限 | 原生 ContentSettings；schema 公开实际作用域和容器支持情况 |
| P1 | `storage inspect / read / clear`；`container remove` | 查看指定容器、站点的存储及执行定向清理 | 原生分区路由；敏感值受控读取，清理/删除先提供影响预览与确认契约 |
| P1 | `session inspect / restore`；`app launch / quit / restart` | 恢复窗口、标签及容器归属，管理应用生命周期 | 原生会话和进程能力；网站登录有效性由网站决定 |
| P1 | `network list / inspect`；`console list`；`page evaluate` | 诊断网页请求与错误，处理结构化读取的高级需求 | 借鉴 DevTools；响应体、凭据和脚本执行采用独立授权范围 |
| P2 | `history / bookmark / tab-group / pdf / print / zoom / find-in-page` | 补齐原生浏览与个人整理功能 | 原生能力及页面能力按职责接入 |
| P2 | `extension / performance / update` | 扩展管理、性能诊断和后续更新流程 | 按产品范围逐项开放；更新复用已确认的下载与重启确认流程 |

## 接口共同规则

1. 所有网页动作明确 `instanceId` 和 `tabId`，并可附预期 `containerId` 校验。容器 ID 持久；实例 ID 标识一次运行；标签 ID 在声明的生命周期内稳定。浏览器重启后旧目标应显式失效或通过会话恢复记录重新定位。
2. 元素引用绑定 `tabId + frameId + documentVersion`。导航或重建后重新取快照；同名元素有歧义时返回错误。
3. JSON 结果统一包含协议版本、操作 ID、真实目标、执行状态及结构化错误。区分未执行、已执行和结果未知；stdout 给结果，stderr 给诊断。
4. macOS 优先评估受文件权限保护的 Unix domain socket，Windows 评估带用户 ACL 的 named pipe；分别验证调用方认证。网页无管理权限，生产接口通过认证桥接页面能力，原始调试端口属于开发诊断能力。
5. 设置通过公开 schema 暴露类型、范围、默认值、只读/策略管理状态及重启要求。CLI 与桌面界面共享操作和校验。站点权限及存储支持范围单独公布，不推断为天然按容器隔离。
6. 对同一标签的写操作排序；目标切换、页面更新和并发冲突返回可恢复错误。删除、清理与安全设置提供影响预览和确认机制，继承已有有效授权。Cookie、令牌及密码等默认脱敏；必要读取或导出依据明确授权。

## 当前最小验收

1. 在普通有界面且无远程调试入口的 Ecom 中，核对用户现有容器完整保留，人工验证正常网页登录。
2. 通过原生 CLI 入口列出已有容器 ID 与名称；复用现有容器，不创建替代 Profile 或复制 Cookie。
3. 指定一个容器执行一项已授权只读请求，核对身份、返回数据及用户前台焦点；记录当前真实支持范围。
4. 若该任务缺少某项原生能力，明确缺口并逐项实现；登录、权限或验证码问题交由用户在对应容器处理。

## 长期验收清单

1. 发现并认证连接现有 Ecom Dev，列出真实窗口、标签和容器；不创建另一个自动化浏览器来替代用户会话。
2. 在容器 A/B 分别新建标签，完成导航、快照、点击、输入、读取和截图。用户切换当前标签时，CLI 继续准确操作原目标。
3. 验证同一容器共享持久会话、不同容器存储隔离、弹窗和跨域跳转归属、单独退出及重启恢复。先使用本地可控站点，再按授权实测淘宝/千牛。
   后台取数同时验证：同一实例下的两个普通持久容器访问同源接口、使用同名 HttpOnly Cookie 时身份隔离；页面全部关闭后请求可用；重启后容器 ID 和持久会话恢复；操作期间保持用户前台焦点。真实平台另行核对稳定店铺 ID、权限、CSRF/签名、过期与风控分类。
4. 提供原生设置 schema、读取及一项可恢复配置修改，验证 GUI/CLI 一致，再扩展首批设置。
5. 注入元素失效、连接中断、操作超时和双客户端并发，验证错误与操作查询契约。

网页控制项目作为长期接口设计的参考，具体实现按任务需要及原生验证结果选择。代码可抽取范围、维护成本、运行依赖、平台支持和性能尚待实测，当前调研不构成兼容性或性能结论。Ecom 统一 CLI 契约保持独立，电商平台的商品、订单和广告策略由上层业务工具组合调用这些通用接口。

## 业务接口迁移验收

sycmcli 全量取数与填数计划迁入 Ecom CLI 的目标及逐项台账见 [sycmcli 迁移台账](sycm-migration.md)。当前开发版内置 135 个取数定义（原注册表 124 个、直接函数接口 11 个）、37 个业务工作流描述及 7 类填数计划。原生 business.read 协议按编译目录接入 135 个 GET／POST 读取，使用稳定容器 ID 与浏览器私有认证上下文，目录哈希一致后执行。macOS Dev 已编译，生意参谋、万相台、达摩盘与消费券均有代表性真实读取证据；逐接口、日期与分页覆盖继续扩展。优先原生只读初始化；需要页面准备时，在指定容器后台打开固定服务入口，人工验证可显式前台打开。旧 Dev 可兼容 88 个生意参谋 GET。填数保留计划、预览和确认，平台自动提交不在本轮范围。目录迁移与实际功能通过分别验收。
