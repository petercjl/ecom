# Ecom 0.1.12 Windows x64 候选制品

2026-11-24 在 peter-new 构建，原生源码提交为 `15bc91786551180299c625ece2bb079688c33931`，使用 Node.js 24.22.2 和固定的 Release 增量目录。同一提交的功能验收见 [macOS Dev 记录](dev-desktop-0.1.12.md)。

Chromium 固定的资源编译器在构建机上返回拒绝访问。使用 Authenticode 签名有效的 Microsoft Windows SDK 10.0.28000.0 x64 资源编译器生成安装器的 `packed_files.res`。Siso 通过一份临时构建清单完成资源编译和安装器链接，保留原生源码、原构建清单和安全配置。以数据文件方式读取新安装器的 PE 资源，确认 `setup.ex_` 与 `chrome.packed.7z` 的 SHA-256 分别与构建输入一致。

- 首次安装器为 `Ecom-0.1.12-windows-x64.exe`，大小 250,791,936 字节，SHA-256 为 `2e4ffd3cfb0cb63c585522f049d8f4126238a87ea32ab6b17491049f35d3d698`，保留于 peter-new。
- Windows 原生更新程序自测通过。主包及六个分片通过重组校验，损坏分片被拒绝。候选包及其完整性见 [平台制品记录](../../../ecom/releases/windows-x64/0.1.12.json)。
- 本轮验证范围为构建及制品校验。Windows 实装、实际更新和回滚未演练。候选包尚未发布。
