# Ecom VPN 移除

Ecom 不提供 VPN 产品。专属连接服务、Guardian 接口、订阅面板、地区选择、macOS/Windows VPN 实现与辅助进程、设置页、新标签页卡片、命令及资源从源码移除。移动平台随模块携带的专属实现与资源同步清理。Chromium 的通用网络、系统代理与权限保护继续保留。

继承构建描述中的兼容常量集中在 `ecom/removed-features.gni`，固定为 false，不提供可启用的 VPN 构建参数。Windows 已有 COM 方法保留 ABI 兼容签名，直接返回不支持；连接和安装实现已删除。

移除能力同步覆盖原生 GUI 命令及网页调用接口；产品 Agent CLI 没有 VPN 命令。源码校验通过 `node ecom/verify-source.mjs` 检查实现目录与入口缺失，原生编译与启动使用 `node ecom/build-dev.mjs`。本次运行验证范围以实际记录为准。
