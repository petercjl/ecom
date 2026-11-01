# macOS arm64 Ecom Dev 构建与验证

日期：2026-11-01（Asia/Shanghai）。原生代码版本：`08e7a60052d5348d54699674b5a2da09edd02bf5`。

## 结果与产物

原生开发构建通过，Ecom Dev 已启动并完成 9 项自动化功能检查。恢复 main 后再次启动，测试站点的 LocalStorage 数据保留，最终页面为 https://example.com/。

- 应用：`.brave-build/src/out/Component_arm64/Ecom Dev.app`。
- 名称与可执行文件：`Ecom Dev`；Bundle ID：`app.ecom.browser.dev`。
- 原生版本元数据：CFBundleShortVersionString `156.1.98.0`，CFBundleVersion `198.0`。
- 可执行文件实测为 Mach-O arm64。应用内图标与已确认的开发 ICNS 源文件校验一致。
- 开发数据目录：`.brave-build/profiles/Ecom-Dev`，实际权限 0700。调试端口随机分配，实测仅监听 127.0.0.1。
- 浏览器报告正常窗口，尺寸 1200 × 949。原生窗口的目视检查因 Mac 锁屏尚未完成。

## 验证环境

本机 macOS 26.5.2（25F84），arm64，14 个 CPU 核心、24 GiB 内存。Xcode 26.5（17F42）、macOS 26.5 SDK、Metal 编译器 metalfe-32023.883；Node 24.22.2、pnpm 11.28.10。

使用 Component_arm64 输出目录，is_component_build=true、is_debug=false；symbol_level、v8_symbol_level、blink_symbol_level 均为 0，concurrent_links=1。构建在本机执行，关闭远程执行。测试使用独立 Dev Profile，通过开发启动入口运行，钥匙串采用该入口默认的 mock 模式。

## 功能检查

通过真实浏览器进程的开发调试接口操作专用测试标签页，使用仅监听本机的测试站点及外部 HTTPS 站点。下列检查全部通过：

1. 打开本机网页并核对标题。
2. 通过输入事件填写表单，点击按钮并核对结果。
3. 点击链接进入第二页。
4. 后退到原页面。
5. 前进到第二页。
6. 刷新页面，并核对测试 Cookie 与 LocalStorage 状态。
7. 创建、读取并关闭新标签页。
8. 下载文件并核对内容：ecom-dev-smoke.txt，29 字节，SHA-256 `d34f01fd201c9a770423a2e8c42f89e4d2384b8d88dedcfe869c5087f92ae783`。
9. 打开 https://example.com/ 并核对 Example Domain 标题。

增量测试结束后，main 的产物再次启动，额外验证 LocalStorage 跨重启保留和外部 HTTPS 导航。

这是一轮基础功能验证。容器隔离、淘宝/千牛多账号、真实钥匙串、长期稳定性及完整 Chrome 式界面仍按项目验收目标继续测试。浏览器产品 CLI 尚未实现；本轮调试接口测试不代表产品 CLI 已交付。Windows 浏览器编译及运行尚未验证。

启动日志存在 Component 构建的重复 Objective-C 类提示和隔离属性清理警告，本轮功能检查没有因此失败；保留原始日志供后续稳定性排查。

## 增量构建实测

以下时间包含整个开发构建命令的启动、品牌检查、GN 生成和原生构建。均复用已有输出目录及缓存；为本机单次测量，后台应用没有进行实验室级隔离。

| 场景 | 命令总耗时 | 本地并发 | C/C++ 编译任务 | 链接任务 |
| --- | ---: | ---: | ---: | ---: |
| 开发渠道名称、Bundle ID 与品牌元数据更新 | 104.116 秒 | 8 | 240 | 54 |
| 无任何修改重建 | 9.493 秒 | 6 | 0 | 0 |
| 修改一个独立 C++ 源文件中的返回字符串 | 17.974 秒 | 6 | 1 | 2 |
| 恢复 main 后重建 | 17.778 秒 | 6 | 1 | 2 |

后面三次使用同一默认命令：

```sh
pnpm run build Component --target_arch arm64 --use_remoteexec false --offline
```

三次 GN 参数文件校验一致。无修改构建报告 `ninja: no work to do`；小改动与恢复各执行 4 个构建步骤。小改动测试修改 `common/brave_channel_info.cc` 的开发渠道返回字符串，试验提交 `81fb805b77726fc7f0874adce759431369e467e8` 仅位于本地 `codex/incremental-check-20261101` 分支。

目标对象文件 SHA-256 从 `f1939080d415657c3ca707f9ab51d928bfc9416c7d75148a670f6a27312cd676` 变为 `826fea23ee69998c1f65d13b2d0ef4c9c22e76965e23858da27ac0921e56f988`，恢复 main 后重新得到原校验值。当前运行产物来自恢复后的 main。

这些结果确认增量缓存生效，独立源文件的小改动可复用其余浏览器产物。公共头文件、全局构建参数、品牌元数据和引擎依赖的影响范围不同，应分别测量。

## 本机原始证据

原始日志和结构化结果位于忽略提交的 `.brave-build/mac-dev-run-wf2bwn_3/`：

- `build-3.log`、`build-3-result.json`：全量构建的最终续建阶段成功记录。
- `branding-build.log`、`branding-build-result.json`：开发渠道品牌构建。
- `smoke-result.json`、`post-restart-result.json`、`launch-2.log`、`launch-final.log`：功能检查、重启及启动诊断。
- `no-change-result.json`、`small-change-result.json`、`restore-main-result.json` 及同名构建日志：增量计时。
- `probe-state.json`、`probe-object-after.json`：试验提交、源码备份与对象变化。

本轮没有进行安装器或 npm 发布。
