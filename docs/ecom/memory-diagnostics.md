# 原生内存诊断（P0）

P0 提供普通有界面 Ecom 的按需、只读资源快照。浏览器内打开「账号管理 → 内存与标签页」，可查看实例总量、容器估算、标签状态、冻结／卸载原因与可展开的进程明细。首次进入读取一次，之后由用户刷新；没有常驻采样定时器。

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

状态区分 running、frozen、discarded、unloaded 和 unavailable。页面版本由主框架 token 与导航 ID 组成；标签 ID 仅在当前会话内有效，跨重启不能假定不变。

`canFreeze` 为 yes／no／varies／unavailable，原因分别列出本页与关联页限制。`canDiscard` 使用内核主动卸载资格检查并返回独立原因。GUI 提供中文／英文说明，包括可见、最近使用、媒体、通知、表单编辑、设备、锁、WebRTC、固定标签和策略例外。

冻结可能保留大部分堆，卸载需要重新加载。**内核允许不等于业务安全核验完成**：客服、上传、登录与 Agent 任务保护属于后续 P1。本轮没有新增休眠执行、任务租约、策略写入或自动回收。

系统压力等级当前为 unavailable，不以已有 swap 数量伪造压力事件。Windows GUI 采样已有条件编译实现，但本轮只验证 macOS arm64；Windows CLI 传输仍待接入。

验收见 [P0 验收与前后对照](memory-p0-validation-2026-11-06.md)。后续记录活跃标签、加载状态、日期范围、容器、运行时间和系统条件。相同 URL 不保证动态网页完全相同，重启比较不能单独证明策略收益。
