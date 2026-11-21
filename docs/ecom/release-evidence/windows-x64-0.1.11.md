# Ecom Windows x64 0.1.11

原生源码 `7f5c6f9cd782a6515c969a62d25480707174119f`。稳定更新包为 `@lumyne/ecom-windows-x64`。关联 [集成 Dev 验证](dev-desktop-0.1.11.md)。

peter-new 增量编译通过。Windows 更新助手自检、六个分块的安装器重组与校验、损坏分块拒绝全部通过。NAS 安装器与重组安装器的 SHA-256 一致。

## NAS 交付与 npm 验证

安装包已放到 NAS「工具／浏览器」，并从共享目录重新核对 SHA-256。npm 公共 `latest` 指向 `0.1.11`，实际 tarball 与固定制品一致。已通过隔离 npm 安装，六个公开分块全部实际下载并重组，安装器 SHA-256 与 NAS 文件一致。 本轮验证覆盖载荷与隔离 npm 安装。
