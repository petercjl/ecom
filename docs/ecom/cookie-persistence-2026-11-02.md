# 持久账号容器的会话 Cookie 保存

## 行为与责任

持久账号容器在正常退出并重新启动 Ecom 后恢复原有 Cookie 会话。网站仍决定实际登录有效性；用户退出平台、清理网站数据、删除容器及 Cookie 自身到期继续按原生规则处理。临时容器、隐私窗口和内存分区遵循各自生命周期。

Ecom 通过原生网络上下文保存和恢复会话 Cookie；CLI 只调用目标容器的网络能力。网站凭证保持在该容器中，调用方按平台实际响应判断登录和业务状态，另行核对具体平台身份。

## 根因与实现证据

固定 Chromium 基线的 `ProfileNetworkContextService::ConfigureNetworkContextParams` 只为默认存储分区配置会话 Cookie 保存／恢复；非默认分区将 `persist_session_cookies` 与 `restore_old_session_cookies` 都设为 `false`。Ecom 账号容器使用非默认存储分区，因而长期 Cookie 能写入数据库，会话 Cookie 则只存在于当前进程中。

检查时，两个实际容器的后台登录检查均得到 HTTP 200、业务码 0；其 Cookie 期限元数据报告含会话 Cookie，但磁盘数据库中的会话 Cookie 数量均为 0。只读聚合查询显示两者分别有 35 和 32 个未过期的淘宝／天猫持久 Cookie，已过期数量均为 0。该结果说明本次问题不能简单归因为全部 Cookie 到期；也不能仅凭长期 Cookie 尚在就断言重启后登录仍有效。

原生覆盖层在 Chromium 配置完成后，仅为注册的持久容器分区开启上述两项标志。分区匹配使用固定基线的 `Storage/ext/containers/<ID 的 SHA-256 前六字节大写十六进制>` 路径规则，同时检查容器注册记录；排除内存分区、隐私 Profile 和临时容器 ID。实现位于 `chromium_src/chrome/browser/net/profile_network_context_service.{h,cc}`。

该修改保留站点原有 Cookie 期限、加密存储和容器归属。现有版本未曾保存的会话 Cookie 无法从数据库恢复，因此首次迁移到修复版时可能需要在原容器登录一次。

## 验收状态

- 原生网络模块已编译通过；完整构建与真实重启验证进行中。
- 工作区、原生 CLI 参数与账号管理回归共 24 项通过。
- 需要在修复版取得真实登录成功后，验证会话 Cookie 写入原容器，再正常退出并重启，核对无再次登录时的服务响应。
- 平台服务登录与店铺身份绑定分别验收；本记录的业务码 0 仅证明对应服务登录检查通过。
- 当前证据来自 macOS arm64 Dev。Windows 运行行为尚未验证。

## 开发集成

修复纳入主分支，使用 `node ecom/build-dev.mjs` 构建当前 main 的完整已提交源码并正常重启，集成同一主分支的其他开发成果。此前隔离源码构建仅为诊断证据，产品验收以 main 的实际产物为准。
