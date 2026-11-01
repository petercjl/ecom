# Ecom macOS 应用图标

确认源图为 `assets/ecom-icon.png`，三色旋转圆形与白色购物车。macOS 应用同时包含传统 ICNS 与 AppIcon 编译资源 `Assets.car`，两者从同一源图生成。原生 Info.plist 的 CFBundleIconName 为 AppIcon，开发渠道使用 mac/development 下的资源。

## 生成与校验

选择完整 Xcode 后运行开发工具命令：

```sh
pnpm run ecom:icons:mac
pnpm run ecom:icons:mac --check
```

生成使用系统 sips、Xcode iconutil 和 actool，将原图按 macOS 图标尺寸导出，再编译 AppIcon 资源目录。生成时保留已有输出的可恢复备份；暂存与备份分别位于忽略提交的 .brave-build 和 .local-backups。源图及输出校验一致时，默认生成命令直接返回 changed=false；需要重新生成时使用 --force。

`ecom/macos-icons.json` 记录源图 SHA-256、生成工具版本及输出校验值。--check 与源码检查可跨平台核对这些已提交的资源，无需在 Windows 上调用 Xcode。检查发现源图或输出变化时，先在 Mac 重新生成，再提交相关源图、输出和记录。

生成覆盖默认与 development 渠道的 app.icns、Assets.car。应用通过同一原生构建流程打包，构建完成后重启 Dev 版以读取新资源。Windows 图标及工具栏的功能图标分别维护。

这是开发工作区命令。图标属于品牌资源，本次不新增浏览器可操作能力，产品 Agent CLI 的实现状态保持在能力规划中。

格式参考：[Apple App Icon Asset Catalog](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/AppIconType.html)。

## 本机验证（2026-11-01）

macOS 26.5.2 arm64 已完成源图与输出校验、实际打包校验和界面检查。原生构建 `0a98de9c20f4d93b296a5798d51adebd1566d30d` 增量命令耗时 34.811 秒，原生阶段执行 93 个步骤并通过。应用中的 app.icns、Assets.car 与 development 渠道源文件校验一致。

Finder 的 Ecom Dev 应用简介、顶部图标与预览均已目视确认为三色购物车图标。Dev 版重新启动后已检查原生窗口及网页显示。原始构建和启动日志保存在忽略提交的 `.brave-build/icon-update-d_pa3xls/`。本轮应用图标验收完成；工具栏各功能图标按产品界面规划单独维护。

## 浏览器界面购物车图标

桌面品牌资源以同一份 `assets/ecom-icon.png` 生成：设置页标题与渠道标志、关于页、内置页面图标、地址栏产品图标、菜单中的产品图标及 Shields 按钮。保留原有资源名称和功能绑定；Shields 关闭状态采用较低透明度，原有状态文字与交互继续生效。

`node ecom/generate-ui-icons.mjs` 在 macOS 使用 Xcode Swift、CoreGraphics 和 sips 转换已确认源图。转换仅移除与画布边缘连通的浅色背景，保留中央白色购物车，按资源原尺寸居中等比输出；原生 VectorIcon 使用同一源图的颜色采样。WebUI 的品牌 SVG 包含透明 PNG，明暗主题共享购物车图标。生成前备份已有资源，清单保存于 `ecom/ui-icons.json`。

`node ecom/generate-ui-icons.mjs --check` 可跨平台校验源图与输出 SHA-256，已纳入源码检查。资源修改后使用 `node ecom/build-dev.mjs` 编译并重启 Ecom Dev。此改动属于外观资源更新，不新增可操作功能或产品 CLI 命令。
