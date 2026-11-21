# Ecom macOS arm64 0.1.11

原生源码 `7f5c6f9cd782a6515c969a62d25480707174119f`。稳定更新包为 `@lumyne/ecom-macos-arm64`。关联 [集成 Dev 验证](dev-desktop-0.1.11.md)。

macOS arm64 增量编译通过。更新助手自检、应用架构与签名检查、离线更新恢复检查通过。安装映像与 npm 应用归档来自同一份应用，框架与调试符号 UUID 一致。

## NAS 交付与 npm 验证

安装包已放到 NAS「工具／浏览器」，并从共享目录重新核对 SHA-256。npm 公共 `latest` 指向 `0.1.11`，实际 tarball 与固定制品一致。已通过隔离 npm 安装及应用归档哈希复核。 本轮验证覆盖载荷与隔离 npm 安装。
