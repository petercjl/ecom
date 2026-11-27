# Windows 原生 CLI Dev 验收

2026-11-27 在 peter-new 的 Windows x64 完成原生服务编译和普通桌面启动。浏览器原生实现为 `38cb98133`。最终经 `5156da85a` 的 `build-windows.mjs --dev` 验证，可运行副本复用 Release 编译缓存，使用独立 Dev Profile。

- 实际 CLI 在 Windows 按 Profile 定位 Dev，在缺少显式目标时不会将 Dev 当作正式版。容器列表和账号详情通过 Windows 用户专属的 NTFS 信箱读取。
- 本机 HTTPS 测试站点为两个临时容器分别设置不同 Cookie。并发通过 CLI 读取时，各自返回对应的值，返回内容中的测试令牌字段已脱敏，越过允许来源的请求被拒绝。
- 正常重启生成了新的实例 ID。两个容器的 ID 及各自的持久 Cookie 均保留，重新读取通过。测试证书仅用于回环测试站点。
- CLI 0.6.1 的固定 npm 候选包已校验 SHA-512，并在 peter-new 隔离安装。该包实际连接最终 Dev 副本，返回五个容器。macOS CLI 测试 80 项通过。Windows CLI 测试 62 项通过，18 项按平台跳过，原生通信另由上述实机测试覆盖。
- Dev 程序目录由 Chromium 安装辅助程序设置 AppContainer 的读取和执行权限，两个安装能力的访问控制项已核对。实际运行副本与构建入口重新生成的 EXE 和主 DLL 的 SHA-256 一致。启动参数保持普通有界面模式和默认沙箱。
- 已通过 Dev 入口打开生意参谋验收容器的首页。真实店铺登录及交易概况读取需独立验收。
