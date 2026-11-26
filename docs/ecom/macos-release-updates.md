# macOS 正式版与 npm 更新

Ecom 正式版以 `Ecom.app`、`app.ecom.browser` 和原生数据目录 `Ecom/Ecom` 标识；Ecom Dev 使用独立标识及原有工作区 Profile。首个目标为 macOS arm64，首次安装交付 DMG，更新载荷使用公开 npm 包 `@lumyne/ecom-macos-arm64` 的 `latest` 渠道。版本和载荷契约由 `ecom/release-config.json` 定义；浏览器发布版本与 Brave/Chromium 基线版本分别记录。

## 责任与流程

浏览器在普通有界面模式运行。正式安装包内的原生 Swift 助手负责 npm 元数据检测、下载校验、确认及应用替换，使用系统网络与文件接口。用户无需 Node.js、npm 或终端。网页、Agent CLI 和店铺会话均不持有安装权限；更新助手使用无 Cookie 的独立网络会话。

启动时检测，随后每六小时检查。正式版固定读取 `latest`。未发布首个版本时的 404 按无更新处理。发现更高的稳定版本后询问是否下载；用户同意才下载；验证及解压完成后再次询问是否正常退出并安装。等待正常退出最长一分钟，超时保留运行中的应用。正式版元数据和助手仅在打包副本中加入，Dev 不启动该助手。

npm 提供版本元数据、tarball URL 和 SHA-512 integrity；助手仅访问 HTTPS 的 `registry.npmjs.org`，限制重定向到同一主机。tarball 内必须恰好包含 `package.json`、`artifact.json`、`Ecom.tar.xz` 和 `LICENSE`。检查归档 SHA-256、字节数、源码提交、版本、目标架构、应用标识、更新协议、嵌套代码签名和包内链接；不运行 npm 生命周期脚本。

应用在原安装目录的私有暂存目录准备。仅替换应用包，账号与容器 Profile 由浏览器继续管理。浏览器原生层传入当前实际数据目录，更新和恢复启动均复用该路径及会话恢复参数，包括显式设置的独立 Profile。安装目录需可写，DMG 挂载卷内不执行替换。正常退出后旧应用保留为唯一命名的 `Ecom.previous-*.app`；新版本启动失败时尝试恢复旧应用，并保留失败产物。操作中断时旧应用仍可由 Finder 手动恢复。回滚应用不会倒退或覆盖网站数据，不承诺跨版本 Profile 格式自动降级。

## 构建及交付

在集成后的 `main` 运行 `node ecom/build-macos.mjs`。入口固定当前已提交的 main 版本，在构建锁内准备干净的受管理源码工作树；根目录中其他任务尚未提交的修改保留在原处，编译与打包仅读取已提交快照。若 main 在编译或打包期间推进，入口保留已有输出，重新加载最新已提交的构建配方并增量构建，直至产物与集成版本一致。`--wait` 可在已有原生构建后排队，等待释放共享锁后再选择 main。入口选择固定 Node 24 和本机 Xcode，与 Dev 共享构建锁，使用独立 `Release_arm64` 输出目录；固定依赖和已有缓存保留。正式版禁用 Brave 更新组件，采用优化的独立整包构建，本机配方关闭 PGO 和 ThinLTO，保持单链接并发以控制内存；不申请开发者证书。`--prepare-only` 仅执行构建前品牌准备，不代表 GN、编译或运行验证。

成功编译后在唯一的 `.brave-build/mac-release-*/artifacts/` 中生成 npm 载荷目录、可直接发布的 `.tgz` 及 `release-receipt.json`。明确要求首次安装包时加 `--with-installer`，以同一应用包生成 DMG。原始构建输出保持完整。打包后执行原生助手自检、架构和嵌套签名校验，记录归档、tarball 与 DMG 校验和、源码提交、Node/Xcode/SDK 版本、GN 参数指纹和验证状态。

本地 ad-hoc 签名用于代码封装与完整性检查，不属于 Apple 开发者身份签名或公证。首次安装的系统提示、从下载产物启动及后续更新需要真实验收；用户按系统正常授权流程操作。

公开载荷仅包含原生应用、发布契约和许可证。打包检查应用资源中的账号数据文件名、外部符号链接及当前用户私有绝对路径，检测到时停止；发布前复核真实打包清单。构建日志、工作区和账号数据不进入包。

Ecom 的正式产品渠道由品牌、应用标识、数据目录和发布契约定义。构建设置 `is_debug=false`、`is_component_build=false` 和 `brave_channel=""`；GN 的 `is_official_build=false` 用于避开基线中 Brave 官方服务密钥与发行基础设施要求，不影响独立应用打包。构建不使用占位服务密钥。性能及与 Dev 的体积差异以完整产物实测为准。

## npm 发布与验收边界

本体包与公开的 `@lumyne/ecom-cli` 独立。使用当前 `npm-release-kit` 在本机完成验证、固定制品准备、npm 身份验证和发布。稳定版默认发布 `latest`，明确指定的预发布版使用 `next`。历史工作流保存在 `.github/archived-workflows/`；GitHub 保存源码和小型发行证据。

在源码仓库运行 `npm-release-kit doctor --root <repo> --json`，通过平台发布校验后，使用 `node ecom/stage-local-publication.mjs <artifacts/npm> <全新本机发布目录>` 为已验证载荷建立独立发布根。该入口校验包身份和归档哈希，以硬链接复用二进制，创建包内容检查策略。对发布根执行 `npm-release-kit prepare --root <发布目录> --release <精确版本> --tag latest --json`，检查固定 tarball、SHA-512、文件清单与私有验证回执，再执行 `npm-release-kit publish --mode local --root <发布目录> --release <精确版本> --tag latest --yes`。npm 登录及发布认证在用户日常 Google Chrome 中完成。

发布证据保存至 `docs/ecom/release-evidence/`，对应记录为 `ecom/releases/macos-arm64/<版本>.json`。记录准确包名、平台、架构、原生源码提交、关联的 Mac Dev 验证提交、制品哈希、签名校验和更新程序自检结果；安装、恢复和真实 npm 更新往返分别记录。源码或原生配方变化后重新验证和构建，发布记录与文档变化可按受控规则复用已验证制品。

`node ecom/create-update-seed.mjs <已验证的Ecom.app> <全新隔离目录>` 可创建测试前驱及独立 Profile，用于按需验收真实下载、用户确认、安装、重启及恢复。此类实测不修改日常账号数据，也不将尚未执行的往返测试记为成功。发布后核对公共 npm 的精确版本、dist-tag、SHA-512，并实际下载完整载荷验证其原生归档。重试沿用同一版本和固定制品；网络结果未知时先核对注册表状态。

scope 迁移采用旧源 `@petercjl/ecom-macos-arm64@0.1.9` 过渡包及新源 `@lumyne/ecom-macos-arm64@0.1.10`，先发布并验证新源，再发布旧源过渡包，具体见 [Lumyne 更新源迁移](lumyne-update-migration.md)。

当前 GUI 更新入口为原生助手的两个确认对话框；设置页的手动检查、进度展示及产品 CLI 的 update status/check/download/apply 尚未开放，列为能力缺口。Windows 实现及验收独立记录；Intel Mac 尚待实现和验证。原生助手契约自检和 Node 单元测试不能替代正式浏览器、首次安装或真实 npm 更新往返验收。

普通桌面启动默认启用与 Dev 已验收配置相同的固定 HTTPS 生意参谋来源；显式来源覆盖继续接受原生校验，并随更新和恢复启动保留。CLI 从正式版默认数据目录发现通信端点，也保留显式 Profile 选择；连接前继续核对进程所有者、可执行文件、PID、实例及私有文件权限。正式版 CLI 和编译目录哈希需在实际产物上验收，Dev 的真实店铺记录单独保留。

元数据协议依据：[npm registry package metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)。
