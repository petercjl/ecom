# Windows 原生 CLI Dev 验收

2026-11-27 在 peter-new 的 Windows x64 完成原生服务编译和普通桌面启动。浏览器原生实现为 `38cb98133`。最终经 `5156da85a` 的 `build-windows.mjs --dev` 验证，可运行副本复用 Release 编译缓存，使用独立 Dev Profile。

- 实际 CLI 在 Windows 按 Profile 定位 Dev，在缺少显式目标时不会将 Dev 当作正式版。容器列表和账号详情通过 Windows 用户专属的 NTFS 信箱读取。
- 本机 HTTPS 测试站点为两个临时容器分别设置不同 Cookie。并发通过 CLI 读取时，各自返回对应的值，返回内容中的测试令牌字段已脱敏，越过允许来源的请求被拒绝。
- 正常重启生成了新的实例 ID。两个容器的 ID 及各自的持久 Cookie 均保留，重新读取通过。测试证书仅用于回环测试站点。
- CLI 0.6.1 的固定 npm 候选包已校验 SHA-512，并在 peter-new 隔离安装。该包实际连接最终 Dev 副本，返回五个容器。macOS CLI 测试 80 项通过。Windows CLI 测试 62 项通过，18 项按平台跳过，原生通信另由上述实机测试覆盖。
- Dev 程序目录由 Chromium 安装辅助程序设置 AppContainer 的读取和执行权限，两个安装能力的访问控制项已核对。实际运行副本与构建入口重新生成的 EXE 和主 DLL 的 SHA-256 一致。启动参数保持普通有界面模式和默认沙箱。
- 已通过 Dev 入口打开生意参谋验收容器的首页。真实店铺登录及交易概况读取需独立验收。

## 独立 Dev 可执行文件的账号管理页回归

Windows 崩溃转储定位到 Dev 启动检查调用了依赖 User32/GDI32 的路径比较，导致 Chromium 的沙箱网页进程触发检查失败。修复提交 `2fafa213e` 将子进程的启动过滤放在文件名识别之前，并用适用于早期启动的比较函数。

在 peter-new 增量编译后，旧 Dev 正常退出，修正版用同一 Dev Profile 启动。通过原生账号管理入口打开 `ecom://shops/`，原生标签状态确认该页处于选中状态，Windows UI Automation 确认页面显示“添加账号”。复测期间修正版未生成新崩溃转储，CLI 仍可列出原有容器。

## Windows 正式版和 Dev 的桌面登录路由

在 peter-new 同时运行正式版和 Dev，使用隔离安装的候选 CLI，通过 `agent-desktop` 读取两个实际窗口。默认登录命令选择正式版。Dev 的 Profile 与实例 ID 均解析到同一实际进程。将 Dev 的窗口 ID 传给默认命令、以及将正式版的窗口 ID 传给 Dev 命令，均返回 `DESKTOP_WINDOW_UNAVAILABLE` 和 `loginClick=not-attempted`。

正式版实机覆盖默认桌面入口。显式选择 Windows 正式版需要支持原生通信的浏览器，现有正式实例尚未暴露该入口。真实店铺登录、平台验证及登录后的数据读取分别验收。

peter-new 的交互式 Codex 测试确认 0.6.3 正确选中 Dev，随后在 `focus-window` 得到 `DESKTOP_OPERATION_FAILED`，登录动作状态为 `not-attempted`。修复后，窗口内控件引用由 Windows UI Automation 直接执行。需要按屏幕坐标打开账号行时才检查和取得前台焦点，并重新核对行和控件范围。

候选包在 Dev 处于后台时正确打开账号管理并进入账号查找阶段。使用不存在的测试账号，实机返回 `CONTAINER_NOT_FOUND` 和 `loginClick=not-attempted`。自动化测试覆盖控件可被语义定位时的单次提交，以及无法取得焦点时屏幕坐标分支停止执行。
