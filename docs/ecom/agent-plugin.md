# Ecom Agent 插件

通过公开 npm 包 `@petercjl/ecom-cli` 分发 CLI 与配套 portable Skill，稳定版使用 `latest`。canonical 源码为 `packages/ecom-cli`；浏览器源码和用户会话独立于 npm 载荷。

## 首版能力

产品命令 `containers list` 列出当前 Ecom 中各容器的稳定 ID 与名称，返回实例身份、操作 ID 及版本化 JSON。调用复用浏览器的受限本地邮箱通信，浏览器校验认证；CLI 校验本机用户、运行进程、入口权限与实例身份。浏览器保持普通桌面运行方式，读取期间保持用户当前标签与焦点。

命令 `version`、`help`、`capabilities`、`schema`、`doctor` 用于发现和诊断；`skill source/status/install/update`、`update check/install` 管理当前 Agent 的安装。首版浏览器连接为 macOS；Windows 包安装机制单独测试，浏览器连接实现列为缺口。

## 安装与维护

账号管理页侧栏提供“Agent 插件 · 安装说明”。用户将安装、使用或更新提示词发给当前 Agent，由该 Agent 解析自己的 Skill 目录并调用已公开的机器契约。完成状态要求 CLI、Skill 版本与 SHA-256 完整性校验，以及宿主实际加载 Skill。

每个 Agent 的安装为物理隔离副本，包含完整 CLI 运行时与资源。Node.js 和 Ecom 是声明的外部依赖。仅维护明确选中的 Agent；保留原目标备份，保护本地修改。日常读取最多每天检查一次稳定更新，仅通知；用户授权后将选中目标的 CLI 与 Skill 一起更新。

## 后续扩展

按照 CLI 调研 PRD 增量开放能力：浏览器能力层实现状态和校验，CLI 发布输入/输出和错误契约，Skill 解释调用与恢复。新增命令同时更新能力清单与实际入口测试。电商业务策略由上层应用 Skill 承担。

## 发布路径

GitHub Actions 的 macOS、Windows 包测试通过后，发布任务使用 npm Trusted Publishing。新包首次建立采用单独最小 bootstrap 预发布；正式功能版本与后续发布均通过 OIDC。发布后从公共注册表安装准确版本，验证真实入口和选定 Agent 的配套 Skill。
