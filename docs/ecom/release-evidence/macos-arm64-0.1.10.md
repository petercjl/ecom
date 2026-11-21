# macos-arm64 Lumyne 0.1.10

原生源码：`6ad79c84bc30633d8ec1e65194c2edfe709afc08`；包身份：`@lumyne/ecom-macos-arm64@0.1.10`。关联 [Mac Dev 验证](dev-lumyne-0.1.10.md)。Mac、Windows 的源码差异仅为发布测试补充，原生更新器源文件一致。

签名、实际更新器自检及本地恢复检查通过；使用已发布旧版与新源更新器源码，结合真实包清单及包内身份完成离线迁移契约校验。 本机 npm-release-kit 固定制品与原生打包 tarball 字节一致。SHA-256：`cf72512804010e8d32709f210fadb375cb70894c048c3b2359f607c90c257b01`；SHA-512 SRI：`sha512-/IbwxU/KDZF7XEwzSLf1jTOUl9tq1niCjUPziY9GtSL9cS7X//O+5IIUsWQJ900bzrxX4pte/IRDR40a9VHI3g==`。完整哈希与分块身份见发行记录。

本次迁移验收为原生构建、自动包检查和离线更新器契约；未执行日常正式应用的实际安装、npm GUI 更新往返或回滚。账号 Profile 及已安装的正式应用保持原状。公共 npm 发布与实际下载验证已通过。

## 本机发布与公共注册表确认

通过 npm-release-kit 本机发布固定制品，2026-11-21T03:06:50.841Z 核对公共 `latest=0.1.10`、准确版本及 SHA-512 integrity。实际下载的字节数为 157847668，SHA-256 与上述制品一致。 完整公开 tarball 及内部原生归档均通过验证。 在对应实际平台完成隔离 npm 安装，准确版本为 0.1.10。 GitHub 用于源码与小型证据，未运行 Actions。
