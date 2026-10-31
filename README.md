# Ecom

Ecom 是面向多账号与 Agent 操作的独立桌面浏览器，目标平台为 Windows 和 macOS。原生源码以 Brave v1.98.63 的一次性快照起步，使用固定的 Chromium 156.0.8078.80。Ecom 自行维护功能、版本和安全修复。

![Ecom icon](assets/ecom-icon.png)

## 产品方向

- Chrome 式浏览器界面与基础交互。
- 同一窗口内的持久多账号容器，当前归属明确可见。
- 面向具备本地执行能力的任意 Agent 的稳定 CLI：导航、页面读取与操作、容器、下载和设置。
- Ecom 名称、已确认图标、精简功能与 npm 分发更新。

当前已经建立原生源码基础与开发工作区管理。完整原生编译、Ecom 界面品牌替换、浏览器产品 CLI、安装器和更新程序仍待实现或验收。开发工具命令与浏览器产品 CLI 分别记录状态。

## 开发

需要符合 package.json 的 Node 24、pnpm 11 与相应平台构建工具链。源代码在项目根目录维护，构建使用 `.brave-build/src/brave` 中同一仓库的工作树。开发工作树按选定的 Ecom 提交准备；切换提交前校验工作树中的本地修改。

```sh
pnpm run ecom:check
pnpm run ecom:test
pnpm run ecom:prepare
pnpm run ecom:status
pnpm run ecom:bootstrap
pnpm run build
pnpm start
```

`ecom:bootstrap` 获取固定的 Chromium 与构建依赖，不拉取或合并 Brave 的后续源码。完整编译需要 macOS Xcode/SDK 或 Windows 对应 C++ 工具链；当前机器尚未完成原生构建准备。

## 项目文件

- [AGENTS.md](AGENTS.md)：产品与 CLI 核心约束。
- [技术规划](TECHNICAL_PLAN.md)：责任分层和验收顺序。
- [开发工作区](docs/ecom/development.md)：源码、构建工作树与依赖恢复。
- [源码来源](ecom/source-baseline.json)：一次性初始版本、提交与固定依赖。
- browser、components、chromium_src、build：原生浏览器与构建代码。
- ecom：Ecom 自身的开发管理与验证入口。

## 许可证

保留 [MPL 2.0](LICENSE) 及各文件和第三方组件的许可与版权声明。分发前核查源码提供与第三方声明要求。
