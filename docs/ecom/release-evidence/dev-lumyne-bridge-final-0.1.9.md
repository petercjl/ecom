# Lumyne 过渡版最终 Dev 验证

验证源码：`77a26515bc7d0bc91fb0f09578b5a537b4e023f6`。

2026-11-21，统一 `node ecom/build-dev.mjs` 入口在 macOS arm64 复用 Component_arm64 缓存完成 553 项增量步骤，并正常退出、重启现有 Ecom Dev。启动就绪检查确认普通有界面模式且未开启调试端口，继续使用原有 Dev Profile。

已安装的 `@lumyne/ecom-cli@0.4.0` 通过显式 Dev Profile 成功读取 8 个现有容器，返回匹配的实例身份及操作 ID。此次未导出凭证或修改容器会话。完整 Ecom Node 脚本测试 50 项通过，涵盖固定提交构建、保留并发工作区编辑、拒绝未提交构建入口、发布与 scope 契约。正式包校验、旧源过渡与新源载荷、公共 registry 下载验证分别记录。
