# Lumyne 桌面更新源迁移

macOS arm64 和 Windows x64 分别使用公开包 `@lumyne/ecom-macos-arm64`、`@lumyne/ecom-windows-x64`，稳定渠道为 `latest`。CLI 继续使用独立的 `@lumyne/ecom-cli`。

旧客户端仅识别原包名，因此先准备旧 scope 的 0.1.9 过渡版：包清单及安装身份仍使用 `@petercjl`，内置更新器改为读取 Lumyne。新版更新器允许识别旧、新两种已安装身份，网络下载严格核对 Lumyne 包名、平台、版本、完整性和安装身份。Windows 离线打包验证可显式选择受限包名，此参数不改变正常网络更新源。

Lumyne 首版为 0.1.10。先验证两平台的 Lumyne 制品，再发布新渠道，最后将旧渠道 `latest` 固定在 0.1.9。用户通过原应用内更新完成“旧版 → 过渡版 → Lumyne 版”。首次安装包直接采用 Lumyne 源。每次下载、重启继续沿用用户确认流程，容器、账号 Profile 和浏览器数据沿用原路径。

通过 `node ecom/set-release-version.mjs VERSION SCOPE` 同步两平台版本及包描述，保留描述文件备份。历史发行记录和已发布字节不改写。按当前 npm-release-kit 在本机验证并准备固定 tarball，发布使用本机 npm 身份验证；历史 Actions 工作流归档于 `.github/archived-workflows/`，当前发布和验证均在本机执行，不使用 Actions 额度。二进制包不附加 Agent Skill。

迁移验收分别记录：旧客户端接收过渡包、过渡更新器读取新源、Lumyne 包安装验证、失败恢复、账号数据保留及公共 registry 的精确版本和完整性。macOS、Windows 的真实验收不能互相替代。

## 2026-11-21 发布结果

两平台 `@lumyne` 包的 `latest` 均为 0.1.10，旧源 `@petercjl` 包的 `latest` 均为最终过渡版 0.1.9。四个主版本和十二个 Windows 分块均完成公共下载及哈希校验；新源包分别在 Mac 与物理 Windows 完成隔离 npm 安装，Windows 实际更新器另行通过完整注册表下载及载荷重组验证。全部 npm 发布在本机完成。

本轮已固定并验证的源码身份见各发行记录。发布开始后 main 新增的强制密码自动填充功能属于后续原生版本；GitHub main 保留这些新提交。实际日常应用的安装、GUI 更新及回滚往返与本次发布校验分别记录。
