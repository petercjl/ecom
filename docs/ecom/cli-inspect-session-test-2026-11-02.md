# CLI 账号详情与原生请求验收

## 交付契约

交付版本为 `@petercjl/ecom-cli@0.2.1`（`latest`），提供两项新增产品能力：

| 命令 | 输入与结果 | 边界 |
| --- | --- | --- |
| `containers inspect` | 稳定容器 ID 或唯一名称；返回平台、已保存首页、外观、带时间的服务登录状态和身份核验标志 | Cookie 期限是参考；名称不替代平台身份；凭证字段不返回 |
| `session request` | 明确授权的只读 HTTPS URL 与目标容器；返回实例、容器、操作 ID、HTTP 状态与脱敏平台 JSON | GET、显式启用的同一来源；原生身份保护；禁止重定向、HTML、请求体和凭证参数 |

浏览器负责会话、认证、平台身份与网络请求；CLI 负责目标发现、输入校验、协议与结果；应用负责接口语义、日期和指标选择、业务码校验及数据解释。配套 portable Skill 和账号管理页的安装／使用提示词反映同一契约。

## 真实平台结果

环境为 macOS arm64 Ecom Dev，统一从 main 编译和正常启动，未启用 CDP、调试监听或无头入口。验证使用用户既有持久容器，保留 ID、首页及会话。

- 已完成会话 Cookie 持久化修复；一次人工登录后连续两次正常重启仍通过后台登录检查，见 [Cookie 验收](cookie-persistence-2026-11-02.md)。后续原生增量构建与重启期间同一会话继续可用。
- 平台当前前端通过固定 `getPersonalView.json` 取得身份；实现参考其公开客户端资源 `https://g.alicdn.com/dt/sycm-micro-v2/2.0.208/index.js`。原生适配在目标容器内部获取所需页面参数，仅保留店铺 ID、账号 ID 与平台名称。实际结果达到 `state=ready`，详情命令报告 `identityConfirmed=true`。
- 通过真实 npm 打包、脚本禁用安装和物理隔离 Skill 运行时，以及正式公开安装的 0.2.1 CLI，读取已注册 `shop.trade-summary` 对应的单日 2026-11-01 接口；HTTP 200、平台码 0，返回含 `payAmt` 与 `uv` 的交易结构。完整业务数值和凭证未写入分发包或本文。
- 调用固定了同一个实例 ID 与容器 ID。请求前后全部账号的打开标签数量保持一致，目标容器为 1 → 1；取数路径只调用原生网络能力。本轮没有额外采集前台焦点样本。
- 真实安装入口拒绝外部来源、POST 与凭证参数，分别返回 `ORIGIN_NOT_ALLOWED`、`METHOD_UNSUPPORTED`、`CREDENTIAL_INPUT_REJECTED`，均为 `executed=false`。

## 包、Skill 与原生测试

- 0.2.1 版本同步后，16 项 CLI／安装／更新／信箱契约测试通过；真实打包为 19 个分发文件，包不包含浏览器产物、测试 tarball、账号或 Cookie。真实 npm prepack 对能力清单及 Skill 版本不一致的候选分别拒绝打包。
- 已发布 0.1.1、0.1.2、0.1.3、0.2.0 的原始 npm tarball 与注册表 SHA-512 核对后，使用实际旧入口和真实 npm 验证升级、真正旧版备份、同版本核对、本地编辑保护、目标隔离、激活失败恢复、目录重命名拒绝和激活后父进程中断。测试 fixture 仅用于开发，不进入分发包。
- 原生身份解析的五组测试覆盖身份字段白名单、业务失败与非法 ID、旧格式兼容、microdata 来源／编码／重复字段以及诊断脱敏；实际编译并执行通过。
- 配套 Skill 的当前基础格式、共享性及能力契约验证通过。打包入口的 discovery 与独立目标 maintenance witness 通过。未运行独立对话回归。
- GitHub Actions [41449530042](https://github.com/petercjl/ecom/actions/runs/41449530042) 的 macOS、Windows 包 QA 及 Trusted Publishing 均通过；公共注册表已确认 0.2.1 和 `latest`。公开 tarball 的完整性通过，19 个文件与发布源码逐字节一致。该结果验证包机制，Windows 原生浏览器连接仍未实现。
- 本机全局 CLI、Codex 独立运行时、配套 Skill 与安装 receipt 均为 0.2.1，`current=true`、`edited=false`、无需恢复。当前对话通过既有宿主发现路径核对并加载 Skill 的当前契约与适配器；独立新对话发现未单独测试。其他实际 Agent 安装未同步。

## 后续边界

当前真实正向数据验收为一个已核实淘宝店铺及一个生意参谋接口；更多接口、更多店铺的修复版复验及其他平台适配按实际任务扩展。同一容器内更换登录账号时的并发冲突处理、操作查询／取消、Windows 原生通信及完整 GUI／CLI 功能覆盖仍需实现或验证。平台业务成功由调用应用判断，CLI 的 HTTP 成功字段不会代替业务判断。
