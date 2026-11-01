# Ecom 开发工作区

## 目录与版本

项目根目录是唯一源码维护入口，Git origin 指向 petercjl/ecom。main 从 Ecom 初始提交开始演进，源码来源记录保留固定版本及许可证。

.brave-build/src/brave 是同一 Git 仓库的 detached 构建工作树，供工具链使用 src/brave 布局；.brave-build/src 下其余内容属于固定 Chromium 依赖。构建目录和本地缓存排除提交。

## 开发工具命令

通过 package.json 中 ecom:prepare 准备指定 Ecom 提交的工作树，ecom:status 查询状态，ecom:bootstrap 安装锁定依赖。build 和 start 在该构建工作树执行原生脚本。源码修改提交后再准备工作树；已有工作树存在本地修改时停止切换，并保留修改。

开发工具不拉取 Brave 仓库或维护上游分支。依赖引导仅获取 package.json、DEPS 与基线元数据固定的 Chromium、depot_tools 和第三方代码。开发与产品版本调整分别经过验证。

## 中断恢复

已下载依赖随构建工作树保留。depot_tools 的首次 bootstrap 若中断，先在现有下载上完成 ensure_bootstrap，再归档 guard；不删除整个缓存重来。锁定版本不一致、目标路径被其他仓库占用或本地修改存在时明确报错。

完整源码与工具链下载需要持续检查磁盘。macOS 原生编译使用完整 Xcode 与匹配的 SDK；当前基线对应 Xcode 26.5/macOS 26.5 SDK。构建和安装的支持范围以真实运行证据为准。

开发启动默认使用 .brave-build/profiles/Ecom-Dev 保存独立数据。显式开发数据目录参数按调用方选择执行；Ecom 开发入口保持自身更新渠道。

## macOS 开发构建

当前原生品牌为 Ecom Dev，应用标识为 app.ecom.browser.dev，默认原生数据目录为 Ecom/Ecom-Dev；开发启动入口另指定工作区内的独立 Profile。macOS 应用图标从 assets/ecom-icon.png 转换为 ICNS。正式产品身份与发布配置在首次发布前单独确定。

使用独立安装的 Node 24 与 pnpm 11。先执行 pnpm run ecom:bootstrap 下载固定依赖并应用补丁，再在构建工作树中通过 pnpm run gclient -- runhooks 准备编译器及生成资源。执行 pnpm run build Component --target_arch arm64 进行本机开发编译，完成后通过 pnpm run start Component 启动。

源码品牌、图标和配置检查不等于原生编译通过；只有构建产物实际启动后才能记录 macOS 运行验证。

macOS 桌面构建的 Swift 编译器由选定的 Xcode 提供。Chromium 的旧版 iOS Swift 5.8 工具链通过 custom_deps 排除；原生 GN 中该工具链只用于特定 iOS 构建条件，Ecom 的 macOS/Windows 桌面目标不使用它。

固定版本的 depot_tools 由 ecom/depot-tools-policy.mjs 应用 Ecom 的 CIPD 排除适配。适配前验证 Git 提交并保留原文件备份；发现其他本地修改时停止，保留现场。构建工作树内的工具文件由此流程管理，适配源码在项目根目录维护。

macOS 构建命令通过 DEVELOPER_DIR 选择完整 Xcode 的 Contents/Developer 目录。本机验证环境为 Xcode 26.5（17F42）和 macOS 26.5 SDK；系统默认 Command Line Tools 的选择保持独立。

Ecom 桌面构建在 package.json 的 config.gn.args 中选择功能范围：AI 助手、资讯和钱包使用现有 GN 开关关闭；应用更新由 Ecom 自身的更新方案承接，Brave 的应用更新组件关闭。基础浏览、下载、设置和容器沿用原生能力。

macOS 图形渲染构建同时需要 Xcode 的 Metal Toolchain 组件。通过所选 Xcode 的 xcodebuild -downloadComponent MetalToolchain 安装，再以 xcrun metal --version 验证。本机对应 Metal Toolchain 17F42，编译器版本 metalfe-32023.883。

开发构建默认使用 6 个本地任务和 1 个链接任务，symbol_level、v8_symbol_level、blink_symbol_level 默认均为 0。默认配置纳入 package.json，日常构建沿用同一组参数和输出目录。通过 --ninja j:6 可显式选择并发；本地 Siso 保留环境或 siso_limits 配置中更低的上限。调试符号需要时通过 --gn 显式调整，使用独立的 -C 输出目录可保留多组构建配置。

## 验证记录

[2026-11-01 macOS arm64 Dev 验证](mac-dev-validation-2026-11-01.md) 记录实际应用身份、基础功能检查与增量构建耗时。
