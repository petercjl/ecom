# Ecom Windows x64 0.1.13

2026-11-26 在 peter-new 用固定 Release 增量目录构建原生提交 `ad3ac0811314153a11adb5f24290bd1bf676460f`。对应 [Dev 验证](dev-desktop-0.1.13.md)。

原生浏览器编译与链接成功。Chromium 资源编译器启动时返回 WinError 2，使用签名有效的 Microsoft Windows SDK 10.0.28000.0 x64 资源编译器完成安装器资源编译，再按生成的链接配方在独立目录链接。读取新安装器 PE 资源并核对两个嵌入文件的 SHA-256 与构建输入一致，原增量缓存保留。

更新助手自检与六分片重组校验通过，损坏分片被拒绝。安装器 SHA-256 为 `388f1b62494b0542af509d130dbfaa48443baf9e445f543e0eb71ee573d44130`，保留于 peter-new。仅传回 npm 主包、分片及校验记录。Windows 日常安装和跨版本回滚未执行。

## 公共 npm 回验

`@lumyne/ecom-windows-x64@0.1.13` 已发布至 `latest`。六个公开分片及主包均实际下载并核对 SHA-512 元数据、SHA-256 和大小。重新组合安装器后与 peter-new 上的制品 SHA-256 一致。peter-new 从公开 npm 在隔离目录安装主包，确认版本、平台、架构、源码提交和分片数量，完成后清理隔离目录。
