# 小红书会话与搜索对照

日期：2026-11-05；环境：macOS arm64，普通 Ecom Dev，无 CDP、调试端口或无头入口。

## 结论

现有 Cookie 请求探针没有取得小红书搜索列表。手机号验证码登录的方式本身不决定后续请求能否取数；登录会话、请求签名及平台风控条件需分别验证。网站可登录的事实由用户确认，当前接口拒绝不足以证明会话已失效。

## 责任划分

浏览器托管容器凭证及存储、按固定目标执行网络请求；CLI 选择容器、校验参数并判定平台响应；业务 Skill 负责选择关键词与解释结果。最小缺口是小红书请求上下文及签名适配，不能把平台拒绝报告成搜索成功或自动要求用户重新登录。

## 实测

构建入口为 `node ecom/build-dev.mjs`，原生源码提交 `c36edb694`，使用唯一 Dev 数据目录。用户原有小红书容器执行以下固定接口；请求代码不查找标签、不创建页面、不执行页面脚本，也不导出 Cookie。其他已经打开的页面保留，尚未验证“全部小红书标签关闭”的条件。

| 探针 | 固定接口 | 响应 | 验收结果 |
|---|---|---|---|
| search | edith.xiaohongshu.com/api/sns/web/v1/search/notes，POST | HTTP 200，业务码 300011 | 未返回搜索列表 |
| search-v2 | so.xiaohongshu.com/api/sns/web/v2/search/notes，POST | HTTP 406 | 未返回搜索列表 |
| self | edith.xiaohongshu.com/api/sns/web/v1/user/selfinfo，GET | HTTP 406 | 未完成平台会话核验 |

三个探针均要求目标为小红书平台容器，浏览器从其存储分区检查 web_session 是否存在后发送请求。Cookie 存在不是平台登录成功的证据。搜索关键词使用普通测试词“收纳”。未反复重试拒绝请求。

网页搜索对照尚未完成：界面检查工具因 URL 访问限制停止，不能以推荐页内容充当搜索结果。

## xhscli 实际能力

本机安装的 @petercjl/xhscli 0.1.0 在 src/search-browser.mjs 中通过 Chrome CDP 新建搜索页面，网站生成 POST 请求，CLI 拦截响应并检查 success、items、has_more。它没有提供独立的 Cookie-only 签名器。因此直接把它的接口 URL 放入 Ecom 后台网络请求，不能复现完整执行环境。本轮没有启动它的独立 Chrome 或连接 CDP。

## GitHub 依据与适配方向

- [Cloxl/xhshow](https://github.com/Cloxl/xhshow) 提供请求签名生成能力，文档列出 x-s、x-t、x-s-common，并说明搜索还需要 x-rap-param。
- [xhshow issue 104](https://github.com/Cloxl/xhshow/issues/104) 中有用户报告签名格式、真实浏览器 b1 上下文及业务码 300011 的关联；属于第三方个案，不能据此确定本机拒绝的唯一原因。
- [renmu123/xhshow-js](https://github.com/renmu123/xhshow-js) 是 MIT 的 TypeScript 实现，可供评估；本轮没有引入、执行或宣称其签名通过了本机验证。

下一项能力应为容器私有的小红书请求上下文适配：先在原容器验证网站生成的搜索请求及有效签名，再对照原生后台请求。动态请求签名应按 URL、请求体与时间生成；不能将一次请求的签名作为长期凭证保存。如果纯本地签名方案不能复用所需浏览器上下文，应如实区分“后台页面辅助”和“完全不加载页面”，分别验收。

正式命令发布前需具备：真实搜索列表、严格响应 schema、分页与限流、过期与验证状态、原容器身份确认，以及关闭所有平台页面后仍成功取数的证据。当前 npm 能力不作上述承诺。
