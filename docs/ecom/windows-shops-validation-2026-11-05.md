# Windows 店铺管理验收（2026-11-05）

## 修复与构建身份

- 修复提交：`41964b3e4f455f7700f695a173a34d6543cb4948`。
- Windows 原生容器已经启用，但 Ecom 的 WebUI 注册、工具栏管理入口、设置处理器及店铺服务仍限定 macOS，导致 `ecom://shops/` 返回 `ERR_INVALID_URL`。
- 将共用店铺管理、容器首页导航及容器密码存储接入 Windows；保留 macOS 文件信箱通信的平台边界。
- 在 peter-new 构建 Windows x64 Release；增量构建成功，22 步，耗时 2 分 6.91 秒。
- 安装器：`.brave-build/src/out/Release/mini_installer.exe`，250,524,672 字节。
- 安装器 SHA-256：`0B514534C1EA11B8E0ED76A665BF2015060A35D37731EB8629F9F5C180E0762F`。
- 安装程序退出码为 0；卸载登记名称 Ecom，版本 `156.1.98.0`。
- 安装后的主框架与构建输出 SHA-256 一致：`6A992AC78981CBC891B3617D4E0C71B86EA865CD37D6E13514723E172A7355C2`。

## 实测结果

通过普通有界面浏览器及 Windows UI Automation 验证，使用独立临时数据目录；未启用 CDP、调试端口、调试管道或无头模式。

1. 工具栏显示“账号管理”，点击后管理页正常加载，包含平台分类、账号列表和添加入口。
2. “添加账号”显示平台、名称、可选凭证及外观等字段。
3. 使用默认淘宝平台创建测试账号，容器成功写入，管理页显示淘宝分类数量增加和“生意参谋需登录”；未填写凭证、未人工登录，没有将其声明为已登录。
4. 正常关闭后重启，在地址栏输入 `ecom://shops/`，页面加载成功，测试账号仍存在。
5. 退出后读取测试 Profile 的容器配置，创建前后与重启后的容器 ID 一致。

GUI 验收证据位于 peter-new 的 `E:\ecom-build-x64\shops-check-41964`；本地证据副本位于忽略提交的 `.brave-build/windows-shops-check.CW8BWL`。

## CLI 与验收边界

本次启用共用的原生店铺服务和 GUI 调用路径。Windows 的认证本地 IPC、ACL 及产品 CLI 连接尚未适配；`native_session_service` 继续仅在 macOS 编译，相关缺口见 [原生会话 CLI](native-session-cli.md)。本次未验证真实平台登录、多账号隔离、凭证保存及自动更新，不据此扩大支持声明。

本次只构建并在 peter-new 测试安装，安装包未上传 GitHub，也未执行 npm 发布。
