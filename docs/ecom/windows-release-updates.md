# Windows x64 npm 更新

## 责任与产物

Mac Dev 负责首先验证共用功能；Windows 原生程序在 peter-new 编译。入口为 `node ecom/build-windows.mjs`，从已提交 main 准备独立构建工作树、构建 Release 并打包到全新的 `.brave-build/windows-release-*/artifacts`。首次迁移的测试基线可显式指定已提交的 `--source-ref`，与候选源代码分别记录。

配置为 `ecom/windows-release-config.json`，公开包为 `@petercjl/ecom-windows-x64`。产品发布版本与 Chromium/原生安装版本分别记录。载荷包含 `EcomSetup.exe`、`artifact.json`、`LICENSE` 及 npm `package.json`；首次 EXE 与更新包中的 EXE 字节一致。打包不包含 Profile、账号或构建机器配置。

浏览器在普通有界面模式运行，初始 Profile 完成初始化后启动包内 .NET Framework 更新程序；帮助菜单提供“Ecom 更新…”。Dev 构建不含正式更新身份。Windows 收件箱 .NET Framework 是运行依赖，用户无需 Node.js 或 npm。

## 用户流程与边界

1. 每次启动查询所选渠道的元数据。默认 `latest`；在更新窗口显式选择 `next` 只改变当前 Windows 用户的测试渠道。
2. 有新版本时显示更新窗口；点击“下载更新”才下载，不自动安装。
3. 仅从 HTTPS npm 注册表读取，无网站 Cookie，限制主机、大小和重定向；校验 SHA-512、tar 条目与类型、清单身份及安装器 SHA-256，拒绝链接、重复和未知归档条目。
4. 下载后再次确认“退出并更新”。浏览器创建仅限当前用户和 SYSTEM 的退出事件，更新程序核对安装路径和进程身份后请求正常退出；超时或其他 Ecom 进程仍占用安装时保留原安装。
5. 在用户私有 UpdateState 目录保存经哈希验证的 Application 备份和安装中记录，安装器运行完成后检查新 EXE、主框架、更新程序、源码和产品版本，再启动原数据目录并等待就绪回执。
6. 安装或启动失败时恢复备份；结果未知或安装器仍运行时保留恢复现场，不与安装器同时替换文件。已成功更新后可在窗口选择“恢复上一版本”，确认后恢复并重启。用户数据目录始终独立于 Application 备份和替换。

渠道、暂存、回执、恢复记录均位于 `%LOCALAPPDATA%\Ecom\UpdateState`，限制为当前用户及 SYSTEM。工作进程复制到该目录后执行，避免替换正在运行的更新程序。首次安装和 UAC/系统信誉提示按 Windows 实际行为处理，不关闭系统保护。

当前支持每用户的 `%LOCALAPPDATA%\Ecom\Application` 安装；其他位置或架构明确拒绝。完整产品 CLI 的 update status/check/download/apply 仍属 PRD 后续能力，Windows 本地认证 IPC 尚未开放；本次维护参数用于构建和载荷验收，不代表 Ecom CLI 已支持 Windows 更新控制。

## 发布与验证

发布脚本分开检查源码、原生产物、平台身份、包内容和验收证据。Windows 来源发生变化必须重建；候选先发 `next`，只有真实 npm 更新及回滚均通过后允许提升 `latest`。提升沿用同一版本和校验和。

`.github/workflows/ecom-windows-publish.yml` 在 GitHub 托管 runner 通过 OIDC 发布。首次候选使用单文件、临时 HTTPS 传递，工作流校验仓库内固定的完整 tarball 哈希后执行；临时 Actions artifact 在任务结束时删除。已发布版本的渠道提升从 npm 读取并复核同一载荷，不重新构建，不上传 GitHub Release 安装附件。

真实安装、数据保留、更新、取消、失败恢复、回滚和渠道证据记录在 `docs/ecom/release-evidence/` 与 `ecom/releases/windows-x64/`。源码检查和更新程序自检不替代这些实测。
