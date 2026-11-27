# Ecom macOS arm64 0.1.16

2026-11-27 原生源码 `1babedefc146cc9ee4a8114b86991421695b39f8`。关联 [Dev 验证](dev-desktop-0.1.16.md)。

更新助手自检、ARM64 架构和嵌套 ad-hoc 签名校验通过。打包副本使用独立空白 Profile 启动，确认正式渠道和原生业务读取协议，CLI 容器列表成功。无调试监听，浏览器正常退出。交付为 npm 更新载荷。

## 公共 npm 回验

公开 npm 的 `latest` 已核对为 `0.1.16`。公开 tarball 和构建制品逐字节一致，SHA-512、应用归档 SHA-256 与字节数均通过。对应的 ARM64 dSYM 已与框架 UUID 核对并保留。
