# windows-x64 Lumyne 0.1.10

原生源码：`02c3aa59205ca8e015c57a0f6d06f57659f9be7a`；包身份：`@lumyne/ecom-windows-x64@0.1.10`。关联 [Mac Dev 验证](dev-lumyne-0.1.10.md)。Mac、Windows 的源码差异仅为发布测试补充，原生更新器源文件一致。

实际更新器自检、完整载荷校验和损坏分块拒绝通过。保存的实际 0.1.9 过渡更新器完整校验此新源载荷；实际 0.1.8 更新器拒绝直接使用新源载荷，且此前已接受最终 0.1.9 过渡包。 本机 npm-release-kit 固定制品与原生打包 tarball 字节一致。SHA-256：`c752ceac3b85d14f4107f9d246e91e1e5a35c865ac730d5ef1960501e8ccfcfc`；SHA-512 SRI：`sha512-n4Fn53ACFYl+ansrDJe5+y9BSOircwT+fl+ZszUrOhirWlKSJcp9RT0xS+N7L/hLYA79E/G7UzLcvpnotP7plQ==`。完整哈希与分块身份见发行记录。

本次迁移验收为原生构建、自动包检查和离线更新器契约；未执行日常正式应用的实际安装、npm GUI 更新往返或回滚。账号 Profile 及已安装的正式应用保持原状。公共 npm 发布与实际下载验证已通过。

## 本机发布与公共注册表确认

通过 npm-release-kit 本机发布固定制品，2026-11-21T03:06:50.841Z 核对公共 `latest=0.1.10`、准确版本及 SHA-512 integrity。实际下载的字节数为 7347，SHA-256 与上述制品一致。 Windows 主包及六个不可变分块均完成实际下载，重组安装器与原生产物哈希一致。 实际生产更新器通过其原生 .NET 网络及载荷代码从公共 npm 获取主包和六个分块，完整校验通过；未运行安装器、未访问正式账号 Profile。 在对应实际平台完成隔离 npm 安装，准确版本为 0.1.10。 GitHub 用于源码与小型证据，未运行 Actions。
