# Ecom Agent 插件

通过公开 npm 包 `@lumyne/ecom-cli` 分发 CLI 与配套 portable Skill，稳定版使用 `latest`。canonical 源码为 `packages/ecom-cli`；浏览器源码和用户会话独立于 npm 载荷。

## 首版能力

产品命令 `containers list` 列出当前 Ecom 中各容器的稳定 ID 与名称，返回实例身份、操作 ID 及版本化 JSON。调用复用浏览器的受限本地邮箱通信，浏览器校验认证；CLI 校验本机用户、运行进程、入口权限与实例身份。浏览器保持普通桌面运行方式，读取期间保持用户当前标签与焦点。

命令 `version`、`help`、`capabilities`、`schema`、`doctor` 用于发现和诊断；`skill source/status/install/update`、`update check/install` 管理当前 Agent 的安装。首版浏览器连接为 macOS；Windows 包安装机制单独测试，浏览器连接实现列为缺口。

## 安装与维护

账号管理页侧栏提供“Agent 插件 · 安装说明”。用户将安装、使用或更新提示词发给当前 Agent，由该 Agent 解析自己的 Skill 目录并调用已公开的机器契约。完成状态要求 CLI、Skill 版本与 SHA-256 完整性校验，以及宿主实际加载 Skill。

每个 Agent 的安装为物理隔离副本，包含完整 CLI 运行时与资源。Node.js 和 Ecom 是声明的外部依赖。仅维护明确选中的 Agent；保留原目标备份，保护本地修改。日常读取最多每天检查一次稳定更新，仅通知；用户授权后将选中目标的 CLI 与 Skill 一起更新。

## 后续扩展

按照 CLI 调研 PRD 增量开放能力：浏览器能力层实现状态和校验，CLI 发布输入/输出和错误契约，Skill 解释调用与恢复。新增命令同时更新能力清单与实际入口测试。电商业务策略由上层应用 Skill 承担。

## 发布路径

CLI 使用本机 npm-release-kit 完成测试、固定制品准备与经授权的发布；GitHub 保存源码。稳定渠道为 latest。发布后核对公共注册表准确版本及制品完整性，再通过包管理入口同步当前 Agent 的独立 CLI 与 Skill。

## 网页打开规则

用户直接向当前 Agent 说明网址范围、目标容器和启用意图，例如：

> 使用 Ecom CLI，把淘宝和天猫商品详情页设置为用“买家账号”容器打开，并启用这条规则。

CLI 提供列表、查看、保存、指定容器、启用／停用、排序、删除和本地匹配检查。浏览器负责实际匹配、容器隔离和设置校验；CLI 复用同一原生能力。内置淘宝／天猫示例默认关闭且未指定容器，用户要求配置后才按其意图赋值和启用。

## 旧包迁移

> 把我的 Ecom CLI 从 @petercjl/ecom-cli 迁移到 @lumyne/ecom-cli，并迁移当前 Agent 的配套 Skill。

新包提供显式旧包迁移入口，核对旧安装的归属、文件完整性和目标后生成恢复备份。迁移保留浏览器账号、Cookie 和规则数据；已有本地修改需先核对和保留。旧包更新命令继续查询旧 scope，跨 scope 迁移由新包入口完成。
