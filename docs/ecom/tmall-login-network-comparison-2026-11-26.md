# 天猫详情登录跳转对照（2026-11-26）

## 环境与边界

Mac Ecom Dev（Chromium 156，源码 5b0500da75a5f90d1e3478385e66fc3bba230150）与本机商家 Chrome（Chromium 156）。使用同一店铺子账号、同一商品和相同的千牛商品列表来源。商品跳转规则关闭。本记录不含 Cookie 值、登录响应令牌或账号标识。

本轮前经用户明确授权清除了目标 Ecom 容器的天猫 Cookie。其他 Cookie 回读保持不变。此前天猫入口手动登录可使商品正常打开；清除后再次失败。此条件能复现会话缺失后的行为，但不能单独证明最初为何缺失会话。

## 对照结果

1. 两者发出的初始 URL、商品 ID、来源页面及常规 User-Agent 相同；Client Hints 品牌分别为 Brave 与 Google Chrome。
2. Ecom 首次详情请求无可携带 Cookie，未报告阻止原因；Chrome 同一请求携带 35 条 Cookie。二者文档均返回 HTTP 200，未命中 Service Worker 或磁盘缓存。
3. Ecom 收到的实际文档为平台登录门禁页，包含 action=login 和天猫 login_jump 返回路径。导航调用栈指向该文档第 47 行的 link.click()。随后淘宝登录服务器发出 HTTP 302，最终表现为登录页或千牛首页。不是浏览器把商品 URL 改写成千牛 URL。
4. Chrome 返回商品文档，并成功调用天猫商品相关接口；Ecom 在此次失败路径中尚未进入这些详情接口。
5. Ecom 登录页加载平台 third-party-cookie 检测 iframe，其 loginStore.banThirdPartyCookie=false。此处第三方 Cookie 写入/读取探针成功；不能据此泛化为所有登录端点都没有限制。
6. 在 Chrome 临时页面关闭脚本执行，正常 Cookie 导航得到约 69 KB 商品 HTML；用 Fetch 拦截仅为该请求显式设置空 Cookie 头，得到约 5.4 KB、action=login 的同类平台门禁页。只删除拦截头列表中的 Cookie 项不足以达到此结果，显式空头才得到门禁响应。CDP ExtraInfo 的 Cookie 头呈现存在拦截前后差异，不能将其原始计数视作服务器最终收到的准确值。
7. 上述 Chrome 临时页面已关闭，未删除或复制 Chrome Cookie。未修改 Ecom Cookie 策略或启用跳转规则。

## 初轮结论

已定位直接故障链：天猫会话缺失 → 平台返回登录门禁文档 → 文档脚本转向淘宝登录 → 服务端登录分支转向登录页/千牛。Chrome 在单请求空 Cookie 对照中也收到同类门禁响应，因此该现象本身不能证明 Ecom 导航实现出错。

初轮仅定位会话缺失后的行为；后续完整登录监测补齐了根因证据，见下文。

## 常规千牛登录监测与根因

2026-11-26 11:42（北京时间），在默认策略下由用户完成常规千牛登录。私有脱敏事件记录位于本工作区 `.brave-build/tmall-login-watch-y8vxRN/events.jsonl`，日志只存域名、路径、Cookie 名称/属性及接受状态。

1. `havanalogin.taobao.com/newlogin/login.do` 返回 resultCode=100、success=true，并下发 `pass.tmall.com/add` 等跨域同步地址。
2. 浏览器执行天猫同步 Image 请求。302 响应设置 `.tmall.com` 的 `unb`、`cookie2`、`sgcookie`、`csg` 等登录 Cookie。这些登录 Cookie 没有报告拒绝；另一个未声明 SameSite=None 的 XSRF-TOKEN 被 Lax 限制，与这些登录 Cookie 分开处理。
3. 同一容器常规 Cookie 存储仍无天猫 Cookie；持久 Cookie 数据库也未出现本次写入。
4. 在同一千牛页面内嵌天猫检测页，通过该跨域 frame 的实际 document.cookie 能读到 `unb`、`csg`、`dnk` 等登录 Cookie，而顶层容器 Cookie 查询仍为空。探针 iframe 用后已移除。
5. 源码 `CookieSettingsBase::ShouldUseEphemeralStorage` 对允许第一方、阻止第三方的跨站请求返回 true；`CookieMonster::SetCanonicalCookieAsync` 随后写入以顶层站点为键的内存 CookieMonster。访问天猫顶层页面时不会使用淘宝顶层站点的临时 Cookie 存储。临时存储也解释了平台第三方 Cookie 探针为何能通过。

根因是继承 Brave 的默认第三方 Cookie 阻止/临时存储语义，与跨域商家登录需要的正常会话语义不兼容。不是平台未发同步请求，也不是登录 Cookie 被整体拒绝或串入另一个账号容器。

## 通用修复与能力边界

恢复 Chromium 的 `kIncognitoOnly` 默认值：普通 Profile 的跨站登录 Cookie 使用各自容器的正常存储；无痕模式继续阻止第三方 Cookie。只修改默认层，显式用户设置、站点规则及托管策略继续优先，不覆写 Preferences、不复制账号 Cookie，也不加入店铺/平台白名单。

责任划分：原生 Profile 默认策略承担会话兼容性，Cookie 引擎继续执行已有规则和容器隔离；GUI 与原生会话 CLI 共享同一存储。本次未扩展 CLI 命令。通用 Cookie 设置读写和临时 Cookie 存储诊断仍未开放为产品 CLI，本轮使用 Dev CDP 观测，不能表述为普通模式 CLI 的已交付能力。

原先只存在临时存储的登录状态不会被迁移或跨分区复制。修复后的常规平台登录应一次完成会话初始化，无需另走天猫补登录入口。已有完整持久会话保持原样。

## 验证进度

新增 `ecom/experiments/cross-site-login-probe.mjs`，使用隔离 Profile、两个原生容器及本机 synthetic HttpOnly/Secure/SameSite=None Cookie 模拟跨站登录。旧构建默认策略下已稳定复现：跨站设置后顶层访问无会话，重启后仍无会话，第二容器无会话。测试完成后已清理该轮合成 Profile，保留小型报告和日志。修复构建及真实平台验收结果待后续补充。
