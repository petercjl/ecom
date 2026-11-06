# 原生内存诊断与手动休眠

浏览器内打开「账号管理 → 内存与标签页」，查看实例总量、容器估算、标签状态、冻结／卸载原因及进程明细，并对合格标签执行手动休眠或后台恢复。资源快照首次进入读取一次，之后由用户刷新；内存采样按需执行；启用自动休眠后，原生调度按低频检查页面状态。

## CLI 与原生能力

```sh
ecom-cli memory status --json
ecom-cli memory tabs --json
ecom-cli memory containers --json
ecom-cli memory processes --json
```

四个命令返回相同的完整快照结构，让对象关系与总量属于同次采样。多实例时显式选择 `--instance ID` 或 `--profile PATH`。开发兼容入口 `node ecom/cli.mjs memory status --json` 委托同一产品实现。浏览器必须声明 `memorySnapshotProtocol=1`，旧版返回 `BROWSER_UPGRADE_REQUIRED`。本机源码安装与公开 npm 版本的实际内容分别核验，本轮未发布 npm。

通信复用用户私有文件信箱及实例认证，方法为 `memory.snapshot`。GUI 通过仅限内部 WebUI 的消息处理器调用同一个 `GetMemorySnapshot`；外部网页不能调用管理接口。采样不依赖 CDP、调试端口、调试管道或无头模式。

## 输出与计量

| 字段 | 含义 |
| --- | --- |
| `instance`／`instanceId`、`browserPid` | CLI 连接身份及实际主进程；GUI 原生载荷包含主 PID |
| `snapshotId`、`snapshotVersion` | 单个快照 UUID、版本 1 |
| `capturedAtUnixMs`、`sampledAtUnixMs` | 捕获图元数据与完成 OS 采样的时间；非原子快照 |
| `measurementDurationMs` | 工作线程读取 OS 指标及汇总耗时，不含完整 CLI 启动和 UI 渲染 |
| `metric` | macOS physical footprint；Windows 实现为 Private Bytes，跨系统口径不同 |
| `policy` | PrefService 有效状态、管理器当前 Memory Saver 激活状态、冻结偏好及资格策略是否存在 |
| `tabs` | 当前普通 Profile 全部窗口的标签：会话内稳定 ID、窗口 ID、索引、容器 ID、页面版本、标题和 origin |
| `processes` | 原生图中唯一 PID 的指标、关联标签与 worker 数；不含脱离进程树的 crashpad |
| `containers` | 已保存容器与默认会话：标签数、有估算标签数及已归因的页面内存估算 |
| `totals` | 已测进程总量、已归因与未归因部分、不可用进程数和完整性标志 |

macOS 的 `memoryBytes` 包含压缩内存等记账，不等于当前驻留 RAM。`residentBytes` 是另一指标，共享页及重启后的驻留变化需独立解释。

进程只累计一次。通过 Page／Frame／Worker 图关联页面；worker 客户端链递归遍历并防环。全部客户端均能映射到当前 Profile 标签时，按关联标签均分进程内存，明确作为估算。存在未映射客户端、无客户端 worker 或没有网页关联的进程时，保留在未归因部分。主进程、GPU 等公共开销不强行分配到店铺。

**标签估算不是 JS 堆、精确独占内存或卸载后必然可回收的大小。** 容器估算仅累加已归因页面份额，不代表其全部 NetworkContext、缓存和存储对象成本。没有页面估算时返回 null，避免把未归因当成零。

单个不可得指标为 null；退出或权限失败使 `totals.complete=false`，总量此时仅代表已测部分。CLI 校验唯一身份、关联标签存在性、非负数值及总量对账，失败返回 `PROTOCOL_MISMATCH`。内核图／Profile 不可用为 `MEMORY_UNAVAILABLE`，并发采样为 `BUSY`，均不执行页面操作。

标题与容器名仍是用户数据。URL 只返回 origin，排除 path、query、fragment 和网站凭证。进程统计覆盖整个实例，标签仅展示当前普通 Profile；其他 Profile 页面保留为未归因，私密窗口标题不导出。

## 状态与边界

状态区分 running、frozen、discarded、unloaded 和 unavailable。页面版本由主框架 token 与导航 ID 组成；`tabIdKind=native-tab-handle`，标签 ID 使用 TabInterface 句柄，在卸载替换 WebContents 时保持稳定；仅在当前实例内有效，跨重启不能假定不变。窗口 ID 使用独立的窗口会话标识。

`canFreeze` 为 yes／no／varies／unavailable，原因分别列出本页与关联页限制。`canDiscard` 使用内核主动卸载资格检查并返回独立原因。GUI 提供中文／英文说明，包括可见、最近使用、媒体、通知、表单编辑、设备、锁、WebRTC、固定标签和策略例外。

冻结可能保留大部分堆，卸载需要重新加载。手动休眠在原生层使用 PROACTIVE 资格检查，保留 30 秒最近使用保护及表单、编辑、媒体、固定标签、通知、策略例外等校验，并增加加载、上传、WebRTC、锁与已接入原生页面任务的保护。内核自带的自动策略仍保持自己的时间窗，Ecom 自动休眠使用下文独立设置；GUI 分别展示自动资格与手动操作条件。

手动入口为 `tabs discard|wake --tab ID --container ID --expected-page-version VERSION --instance INSTANCE --json`。目标取自同一实例的新快照，默认会话使用 `@default`。执行前在同一 UI 任务内复核页面版本、容器、窗口选中状态与保护；原生动作后重新查找稳定 tab ID，核对容器及 visible URL。没有 force 或前台激活参数。GUI 休眠前展示目标与重新加载影响；有效会话授权可覆盖 Agent 的明确单标签请求。

`discarded` 表示原生卸载完成；`navigation-started` 只表示恢复导航已发起，加载和登录另行检查。持久 Cookie、LocalStorage 等由原容器保留，不清理存储；网站会话过期、验证与页面内存态恢复仍由平台决定。后台恢复不切换用户的窗口或活动标签。

未知操作结果先用 `memory operation --operation-id UUID --instance INSTANCE --json` 查询。每个普通 Profile 在本次浏览器运行中保留最近 128 个动作结果，重启或淘汰后 not-found 代表未知执行状态，不能据此自动重试。UI 与 CLI 共用同一目标校验、保护和操作记录。

原生小红书页面取数使用作用域保护，任务结束或取消后释放；纯原生网络取数不绑定全部网页。外部 Agent 的通用任务租约、持续客服识别、完整上传场景验收和自动调度仍未完成。MVP 采用显式选页，任务状态不明的业务页应保持运行。

系统压力等级当前为 unavailable，不以已有 swap 数量伪造压力事件。Windows GUI 采样已有条件编译实现，但本轮只验证 macOS arm64；Windows CLI 传输仍待接入。

验收见 [P0 验收与前后对照](memory-p0-validation-2026-11-06.md) 和 [P1 手动休眠实测](memory-p1-validation-2026-11-06.md)。后续记录活跃标签、加载状态、日期范围、容器、运行时间和系统条件。相同 URL 不保证动态网页完全相同，重启比较不能单独证明策略收益。


## 自动闲置休眠

GUI 的自动休眠开关、闲置分钟数、单页“保持运行”，与 CLI `memory auto status|set`、`tabs protect` 使用同一原生能力。设置保存在当前 Profile，默认关闭、闲置阈值 1200 秒；明确启用后每 30 秒检查一次，每轮最多卸载一个合格后台页，范围 60–86400 秒。启停／修改阈值、恢复或导航后重新计时；新启动观察到的页面先经过完整闲置期，不会立即批量卸载恢复会话。关闭停止新的自动卸载，已休眠标签按需恢复。

```sh
ecom-cli memory auto status --instance INSTANCE --json
ecom-cli memory auto set --enabled on --idle-seconds 1200 --instance INSTANCE --json
ecom-cli tabs protect --tab ID --container ID --expected-page-version VERSION --keep-awake on --instance INSTANCE --json
```

普通窗口的选中／可见标签保持运行。每次执行前重新核对页面版本、容器、原生 PROACTIVE 资格及附加保护。表单／编辑、离开页面确认处理、播放中的音频与视频（含静音）、上传、设备、WebRTC、锁与关联页、已接入原生页面取数任务及显式保持运行均阻止休眠；原生页面任务结束后重置闲置时间。保持运行保护同时适用于手动休眠，作用于该实例内的稳定标签，持续到明确释放、标签关闭或浏览器重启，跨导航保留。它本身不会唤醒已卸载页。

外部 Agent 的页面任务先以精确实例、标签、容器和新页面版本开启 `tabs protect --keep-awake on`，完成或取消时重新读取目标并释放。纯原生后台网络请求依赖容器存储，不要求网页常驻。无法识别的业务编辑状态、持续客服可显式保持运行；自动检测不承诺理解所有网站自定义业务状态。

快照顶层 `automatic` 返回有效设置、运行／暂停状态、检查次数、自动卸载数和最多 32 条动作引用（不含页面内容）；每页同名字段返回闲置时间、资格、原因及保持运行状态。自动动作复用 `memory operation` 的最近 128 项结果。执行后身份或卸载状态不明确时暂停新自动卸载，检查后通过关闭再开启恢复。保护条件未通过不强制卸载。关闭标签会清理其运行期条目。
