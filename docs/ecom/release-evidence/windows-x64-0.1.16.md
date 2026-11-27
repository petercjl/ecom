# Ecom Windows x64 0.1.16

2026-11-27 原生源码 `1babedefc146cc9ee4a8114b86991421695b39f8`。关联 [macOS Dev 验证](dev-desktop-0.1.16.md)。

peter-new 原生浏览器增量编译与链接通过。Chromium 自带资源编译器启动时返回 WinError 2，沿用签名有效的 Microsoft SDK 10.0.28000.0 x64 资源编译器，在独立目录完成更新载荷链接。两个 PE 嵌入资源与构建输入 SHA-256 一致。更新助手自检、六分片重组和损坏分片拒绝均通过。交付为 npm 主包和六个分片。正式 GUI 安装、更新及回滚测试单独记录。
