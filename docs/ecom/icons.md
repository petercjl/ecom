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
