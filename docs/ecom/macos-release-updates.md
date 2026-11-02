# macOS 正式版与 npm 更新

Ecom 正式版以 `Ecom.app`、`app.ecom.browser` 和原生数据目录 `Ecom/Ecom` 标识；Ecom Dev 使用独立标识及原有工作区 Profile。首个目标为 macOS arm64，首次安装交付 DMG，更新载荷使用公开 npm 包 `@petercjl/ecom-macos-arm64` 的 `latest` 渠道。版本和载荷契约由 `ecom/release-config.json` 定义；浏览器发布版本与 Brave/Chromium 基线版本分别记录。

## 责任与流程

浏览器在普通有界面模式运行。正式安装包内的原生 Swift 助手负责 npm 元数据检测、下载校验、确认及应用替换，使用系统网络与文件接口。用户无需 Node.js、npm 或终端。网页、Agent CLI 和店铺会话均不持有安装权限；更新助手使用无 Cookie 的独立网络会话。

启动时检测，随后每六小时检查。未发布首个版本时的 404 按无更新处理。发现更高的稳定版本后询问是否下载；用户同意才下载；验证及解压完成后再次询问是否正常退出并安装。等待正常退出最长一分钟，超时保留运行中的应用。正式版元数据和助手仅在打包副本中加入，Dev 不启动该助手。

npm 提供版本元数据、tarball URL 和 SHA-512 integrity；助手仅访问 HTTPS 的 `registry.npmjs.org`，限制重定向到同一主机。tarball 内必须恰好包含 `package.json`、`artifact.json`、`Ecom.zip` 和 `LICENSE`。检查归档 SHA-256、字节数、源码提交、版本、目标架构、应用标识、更新协议、嵌套代码签名和包内链接；不运行 npm 生命周期脚本。

应用在原安装目录的私有暂存目录准备。仅替换应用包，账号与容器 Profile 由浏览器继续管理。安装目录需可写，DMG 挂载卷内不执行替换。正常退出后旧应用保留为唯一命名的 `Ecom.previous-*.app`；新版本启动失败时尝试恢复旧应用，并保留失败产物。操作中断时旧应用仍可由 Finder 手动恢复。回滚应用不会倒退或覆盖网站数据，不承诺跨版本 Profile 格式自动降级。

## 构建及交付

在集成后的洁净 `main` 运行 `node ecom/build-macos.mjs`。入口选择固定 Node 24 和本机 Xcode，与 Dev 共享构建锁和受管理源码工作树，使用独立 `Release_arm64` 输出目录；固定依赖和已有缓存保留。正式版禁用 Brave 更新组件，使用本地非 PGO 构建，不申请开发者证书。`--prepare-only` 仅执行构建前品牌准备，不代表 GN、编译或运行验证。

成功编译后在唯一的 `.brave-build/mac-release-*/artifacts/` 中生成 DMG、npm 载荷目录及 `release-receipt.json`。DMG 与 npm ZIP 来自同一份应用包。原始构建输出保持完整。打包后执行原生助手自检、架构和嵌套签名校验，记录归档与 DMG 校验和、源码提交和验证状态。

本地 ad-hoc 签名用于代码封装与完整性检查，不属于 Apple 开发者身份签名或公证。首次安装的系统提示、从下载产物启动及后续更新需要真实验收；用户按系统正常授权流程操作。

公开载荷仅包含原生应用、发布契约和许可证。发布前检查应用资源、隐私内容及真实打包清单；构建日志、工作区和账号数据不进入包。

## npm 发布与验收边界

本体包与公开的 `@petercjl/ecom-cli` 独立。当前本体包尚未建立；首次创建须单独批准最小 prerelease bootstrap 和一次性 Trusted Publisher 设置。常规正式发布通过 GitHub 托管 Actions 与 OIDC，由 `npm-release-kit` 调度；不从本机直接发布正式载荷。稳定渠道为 `latest`，发布动作另行确认。

发布流水线需以已验证的不可变原生产物为输入，检查 receipt、源码及版本对应关系、两次确认流程、取消、正常退出、重启和回滚验收。缺少原生验证的 receipt 不满足发布条件。尚未配置或运行本体发布 workflow，不能把 CLI 的既有 workflow 当作本体发布证据。

当前 GUI 更新入口为原生助手的两个确认对话框；设置页的手动检查、进度展示及产品 CLI 的 update status/check/download/apply 尚未开放，列为能力缺口。Windows 与 Intel Mac 待分别实现和验证。原生助手契约自检和 Node 单元测试不能替代正式浏览器、首次安装或真实 npm 更新往返验收。

元数据协议依据：[npm registry package metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)。
