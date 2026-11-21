# windows-x64 0.1.9 过渡包最终制品

源码：`77a26515bc7d0bc91fb0f09578b5a537b4e023f6`；包身份：`@petercjl/ecom-windows-x64@0.1.9`。关联 [Mac Dev 验证](dev-lumyne-bridge-final-0.1.9.md)，使用同一已提交源码完成原生增量构建。

更新器自检、完整载荷校验和损坏分块拒绝通过；实际已发布的 0.1.8 更新器接受此最终候选的主包和全部分块。Windows 工作树六项测试通过。 主 tarball SHA-256：`74638811642fcca169eb9c2efcad76d9c6b2918faa7b9126b093d2e7f04532c4`；SHA-512 SRI：`sha512-n9fUM9vE/my4yvKgEDldD09zINxaB4ARcSUHEQrGvylFA2vPlt9+TeXcF4ZRly8JjACLLC+Li7RMcwTOXRiQuw==`。安装包与更新载荷来自同一原生产物，准确身份和全部哈希见发行记录。

账号数据和正式应用保持原状。真实正式应用安装、npm GUI 更新及回滚往返本次未执行，对应状态保留 false。此旧源最终过渡版本在对应 Lumyne 0.1.10 完成公开下载校验后发布。

## 本机发布与公共注册表确认

通过 npm-release-kit 本机发布固定制品，2026-11-21T03:06:50.841Z 核对公共 `latest=0.1.9`、准确版本及 SHA-512 integrity。实际下载的字节数为 7338，SHA-256 与上述制品一致。 Windows 主包及六个不可变分块均完成实际下载，重组安装器与原生产物哈希一致。 GitHub 用于源码与小型证据，未运行 Actions。
