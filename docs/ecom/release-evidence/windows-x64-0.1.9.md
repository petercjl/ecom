# Windows x64 0.1.9：Lumyne 更新源过渡包

此记录为未发布的初始候选；最终发布制品及校验见 [0.1.9 最终记录](windows-x64-0.1.9-final.md)。

原生源码提交：`f3f1c2c04b61f7932b709ca61fcecce26bfe1693`。公开包身份为 `@petercjl/ecom-windows-x64@0.1.9`，目标渠道 `latest`；包内更新器读取 `@lumyne/ecom-windows-x64`，安装身份兼容旧源与新源。

通过统一 `node ecom/build-windows.mjs` 入口在 Windows x64 完成原生增量构建及安装包打包。更新器自检、六个分块的完整载荷核验、损坏分块拒绝均通过。暂存目录成功清理与失败保留行为的三项 Python 测试在 Mac 和 Windows 分别通过。

安装器大小为 250704384 字节，SHA-256 为 `92f95a62dccc88d178ca6ced5cd5b7d68bd94f777c046c155f178291013f6ae1`。主 tarball SHA-256 为 `f0815faa31efff34c49b70923656bd8d102bbcc2f3be83dfdf38672834676d5e`，SHA-512 SRI 为 `sha512-jx7eYNccWjbKP/K1uXLFLxE3OMVd9pO3p1vypfFToOhbxFWORZIskdFBcOSpVhnsH2lCpb8F5csg0JZpwHGI3A==`。主包和六个分块已在 Mac 上通过 npm-release-kit doctor/prepare；固定制品与 Windows 原始 tarball 的哈希逐一相同。首次安装 EXE 保留在 Windows 构建主机，跨机传递仅包含 npm 载荷及核验记录。

使用实际已发布的 0.1.8 更新器执行离线 `--verify-payload`，完整接受该 0.1.9 主包及全部分块。旧更新器 SHA-256 为 `feec45eaee7020d7fc403081d3a8c03b5bfb42135642353449ad902815f9a849`，与旧发行记录一致。这是旧客户端接收过渡载荷的离线契约证据。

本次未执行正式应用安装、真实 npm GUI 更新往返或回滚；`nativeSmokeTest`、`localUpdateRecoveryVerified`、`updateRoundTripVerified` 与 `rollbackRoundTripVerified` 保持 false。正式应用及其账号数据保持原状。发布前还需关联当前 Mac Dev 验证，并通过发行记录校验；先发布并验证 Lumyne 新源，再发布旧源过渡包。该初始候选未发布，正式过渡包以最终记录为准。
