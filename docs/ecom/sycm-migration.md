# sycmcli → Ecom CLI 迁移台账

状态：接口目录、原生适配与现有填数计划已进入 macOS Dev；本机 CLI 与 Codex 配套 Skill 已安装候选版 `0.3.0`（未发布），npm 正式版仍为 `0.2.1`。逐接口真实业务验收继续扩展。

## 能力与责任

接口来源固定为 `@petercjl/sycmcli@0.4.0`：原注册表 124 项，加上 `src/sycm.mjs` 中独立实现的 11 个类目、市场排行及搜索词接口，共 135 项。纯目录、业务描述及 MIT 许可证保存在包内 `lib/sycm-vendor`，由 provenance SHA-256 追踪。全局 sycmcli、其 CDP 运行时和个人配置均不是 Ecom 新命令的执行依赖。

Ecom 原生浏览器承担容器、身份核验、登录会话与认证通信；Ecom CLI 业务模块承担注册接口的参数校验、默认值、业务响应判断、结构化错误及本地填数计划。分析、经营策略、报表与真实填数执行由应用或后续执行能力承担。37 个业务能力说明保留为目录，不能计为自动分析接口。

## 当前覆盖与验收

| 服务 | 取数定义 | 当前执行状态 |
|---|---:|---|
| sycm | 85 | 原生 business.read 定义已接入；逐接口业务验收待扩展 |
| alimama | 30 | 原生认证与只读 POST 已构建；账号配置、行业类目读取通过 |
| sycm-trade | 3 | 原生 business.read 定义已接入；逐接口业务验收待扩展 |
| dmp | 7 | 原生用户信息初始化、日期范围与店铺概况读取通过 |
| coupon | 10 | 原生千牛会话费用初始化读取通过，返回店铺名称一致 |

新的原生 `business.read` 协议接入全部 135 项固定 GET／POST 读取，已在 macOS Dev 构建并重启。浏览器承担各服务认证上下文，CLI 仅传操作 ID、稳定容器 ID 和参数，并核对目录哈希。旧版浏览器保留 88 项生意参谋 GET 兼容通路。目录定义已接入不等于每个接口均在真实账号下通过。

原有 sycmcli 的独立 Chrome 店铺绑定由 Ecom 已管理的持久容器承接；调用方冻结实例和容器 ID，无需另建 CLI 店铺 Profile。已配置账号继续接受原生身份核验。各服务读取采用同一容器的实际会话及权限，用户已确认三项服务页面可进入；这不替代逐接口结果验收。

2026-11-02 已通过源码真实入口读取“杉居旗舰店”2026-11-01 交易概况，原生和业务状态均成功，支付金额约 20,144.75 元、支付买家 1,002 人、访客 11,691 人。此结果验证具体账号和具体接口，不代表当日实时口径、其他平台或所有接口通过。取数沿用已有实例，未创建网页或激活标签。

同一实例以“抱抱云朵社”容器读取相同日期，返回支付金额 34.8 元、买家 1 人、访客 221 人；响应实例及容器 ID 均匹配。2026-11-03 补充验证：`category.main`、`coupon.fee-init`、`dmp.shop-date-range`、`dmp.shop-overview`、`alimama.member-config`（`bizCode=universalBP`）及 `alimama.insight.industry-categories` 的原生和业务响应成功。达摩盘未打开页面即可完成只读初始化及取数；万相台曾返回 HTTP 403，在原容器正常打开入口后，直接请求成功。此证据不证明后续会话过期时始终无需入口初始化。

### 原生优先与页面回退

优先研究并实现服务自己的只读会话初始化。达摩盘依据其公开[页面入口](https://dmp.taobao.com/index_new.html)、[版本配置](https://dmp.taobao.com/cdn/version/v2?bizCode=dmp&tag=dmp-new)与 first-party prepare/service 模块，使用固定 `/api_2/login/loginuserinfo` GET 初始化原生请求上下文；返回店铺 ID 时与容器绑定核对。接口凭证始终留在浏览器原生进程。

需要页面准备时，`sycm open` 在指定容器打开编译目录中的固定服务入口，默认后台打开或复用；人工登录／验证可显式选择前台。该操作保留账号首页与持久容器，不创建独立浏览器。打开页面只说明开始导航，不构成登录或取数成功；准备完成后继续走原生读取。此命令已通过真实入口验证后台导航及目标容器归属。

万相台动态模块若返回数据模板，浏览器仅展开该注册读取响应给出的数据流 ID，固定使用平台读取路径，至多 16 项且受同一总超时约束。CLI 保留原始脱敏响应和数据流，并输出 `resolvedResponse`。数据流失败返回错误；数据流成功但平台未返回某个模板所需值时，返回 `businessStatus=partial`、`completeness.complete=false`，保留缺口，不推断缺失数值。真实行业策略模块已触发两项原生数据流；平台返回空的解释数组，相关可见性模板因此保留为部分结果。行业画像、类目读取返回成功。此通路的模拟测试与真实平台验收分别记录。

## 命令契约

- `sycm operations`：列举原子取数定义、参数与原生适配状态。
- `sycm schema --operation ID`：查询单接口定义。
- `sycm run --operation ID --container VALUE --params-json JSON`：调用指定原生容器；参数 JSON 也可来自文件。
- `sycm open --operation ID --container VALUE [--foreground]`：在指定容器打开固定服务入口；默认后台打开／复用，供已授权的页面初始化或人工登录。
- `sycm capabilities`：取数、37 个业务说明与 7 个填数工作流的完整目录。
- `sycm mutation plan --operation ID --container VALUE --params-json JSON`：核验身份后保存 15 分钟有效的本地计划，返回实际载荷、摘要、幂等键与确认码。
- `sycm mutation show --plan ID`：读取计划状态，排除载荷与确认摘要。
- `sycm mutation apply --plan ID --container VALUE --confirm CODE`：重新核对实例、容器、平台身份、期限及载荷完整性，一次性确认并返回工作流。

所有命令支持 JSON；取数沿用 `--profile`、`--instance` 固定上下文。`businessStatus=success` 只说明业务响应成功，日期、实时性和分页覆盖另行核对。Cookie、Token 由浏览器保管，拒绝凭证参数。填数命令返回 `executed=false`、`automaticSubmission=false`；确认记录不等于平台提交。

## 填数计划

| 工作流 | 说明 | 当前执行边界 |
|---|---|---|
| `qianniu-product-batch-draft` | 批量创建商品草稿 | 本地计划、审查、确认与回读要求 |
| `product-migration-guide` | 商品迁移与发布配置 | 本地计划、审查、确认与回读要求 |
| `search-recommend-publish` | 搜索推荐内容发布 | 本地计划、审查、确认与回读要求 |
| `video-publish-item` | 商品视频发布 | 本地计划、审查、确认与回读要求 |
| `sucai-apply` | 素材应用到商品或内容 | 本地计划、审查、确认与回读要求 |
| `shop-index-hosting-manager_2` | 店铺指标托管配置 | 本地计划、审查、确认与回读要求 |
| `mkt_insight-a2ui-price-plan-upload-card` | 价格方案上传与应用 | 本地计划、审查、确认与回读要求 |

## 后续工作与验收门槛

1. 万相台：扩大报表、动态模块与数据流的真实参数及分页覆盖。
2. 达摩盘：扩大商品、类目及分页验证，并覆盖权限拒绝与身份不一致。
3. 消费券：补充具体账期、订单及费用数据完整性验证。
4. 为 88 个生意参谋入口逐类选择真实样例，覆盖 CSRF、权限、分页、日期口径、服务过期与多容器隔离。
5. 正式发布需既有 OIDC 工作流及明确版本/tag 决策；当前开发候选不发布到 latest。

## 本机候选验收

2026-11-03：28 项包测试通过，覆盖真实 npm 打包安装、历史发布版更新、失败恢复、Skill 物理隔离、并发容器归属、目录哈希、认证材料过滤、7 类计划及动态模块部分结果。Skill 格式、可移植性及能力契约检查通过。候选包经隐私扫描后安装，本机全局入口与 Codex 隔离运行时均报告 `0.3.0`；受管 Skill 哈希一致且保留恢复备份。宿主已公布的 Skill 路径已重新读取；未进行新对话回归，其他 Agent 与 Windows 原生浏览器未实测。

通过安装后的 Codex 隔离入口，同一运行实例下再次验证两家店交易概况、万相台账号配置、达摩盘店铺概况及消费券费用初始化成功；行业策略返回两项数据流及明确的部分结果状态。原生 Dev 从 main 增量构建成功并普通有界面重启，保持无调试接口启动。

普通 `session request` 保持既有生意参谋单来源限制。新的 `business.read` 仅按编译目录访问平台固定来源与路径，认证处理在原生层完成。CLI 传操作 ID、容器 ID 和参数，不接受任意来源、方法或认证材料。

## 全部取数入口

“原生 GET 候选”指兼容旧版的通路；“新原生协议”指须升级到本轮原生构建并匹配目录。各定义的 `runtimeVerified=false` 是保守的逐接口标记，真实验收按上文证据单独记录。

| ID | 服务 | 方法 | 必填参数 | 通路状态 |
|---|---|---|---|---|
| `competitor.core-indexes` | sycm | GET | itemId, rivalItemId, dateRange | 原生 GET 候选 |
| `competitor.core-trend` | sycm | GET | itemId, rivalItemId, dateRange | 原生 GET 候选 |
| `competitor.search` | sycm | GET | keyWord | 原生 GET 候选 |
| `competitor.recommend` | sycm | GET | itemId | 原生 GET 候选 |
| `competitor.flow-origin` | sycm | GET | itemId, rivalItemId, dateRange | 原生 GET 候选 |
| `competitor.flow-paid` | sycm | GET | itemId, rivalItemId, dateRange | 原生 GET 候选 |
| `competitor.flow-source` | sycm | GET | itemId, rivalItemId, dateRange | 原生 GET 候选 |
| `competitor.search-words` | sycm | GET | itemId, rivalItemId, dateRange | 原生 GET 候选 |
| `alimama.access` | alimama | POST | — | 新原生协议 |
| `alimama.campaigns` | alimama | POST | — | 新原生协议 |
| `alimama.multi-target-campaigns` | alimama | POST | — | 新原生协议 |
| `alimama.member-config` | alimama | POST | — | 新原生协议 |
| `alimama.report-config` | alimama | POST | — | 新原生协议 |
| `alimama.report` | alimama | POST | — | 新原生协议 |
| `alimama.effect-prediction` | alimama | POST | — | 新原生协议 |
| `alimama.budget-suggestion` | alimama | POST | — | 新原生协议 |
| `alimama.insight.industry-categories` | alimama | POST | — | 新原生协议 |
| `alimama.insight.industry-strategy` | alimama | POST | — | 新原生协议 |
| `alimama.insight.industry-profile` | alimama | POST | — | 新原生协议 |
| `alimama.insight.industry-subcategories` | alimama | POST | cateLevel1Id | 新原生协议 |
| `alimama.insight.industry-traffic-kpi` | alimama | POST | cateLevel1Id | 新原生协议 |
| `alimama.insight.industry-traffic-chart` | alimama | POST | cateLevel1Id | 新原生协议 |
| `alimama.insight.industry-daily-interpretation` | alimama | POST | cateLevel1Id, startTime, endTime, vsStartTime, vsEndTime | 新原生协议 |
| `alimama.insight.industry-daily-chart` | alimama | POST | cateLevel1Id, startTime, endTime, vsStartTime, vsEndTime | 新原生协议 |
| `alimama.insight.industry-opportunities` | alimama | POST | cateLevel1Id, cateLevel1Name, cateLevel2Id, cateLevel2Name | 新原生协议 |
| `alimama.insight.compete-default-category` | alimama | POST | — | 新原生协议 |
| `alimama.insight.compete-market-penetration` | alimama | POST | catelv2Id | 新原生协议 |
| `alimama.insight.compete-bubble-chart` | alimama | POST | catelv2Id | 新原生协议 |
| `alimama.insight.compete-my-items` | alimama | POST | catelv2Id | 新原生协议 |
| `alimama.insight.compete-excellent-items` | alimama | POST | catelv2Id | 新原生协议 |
| `alimama.insight.traffic-shop-categories` | alimama | POST | — | 新原生协议 |
| `alimama.insight.traffic-rank-list` | alimama | POST | — | 新原生协议 |
| `alimama.insight.traffic-hot-words` | alimama | POST | — | 新原生协议 |
| `alimama.insight.traffic-favorites` | alimama | POST | — | 新原生协议 |
| `alimama.insight.trend-topic-list` | alimama | POST | — | 新原生协议 |
| `alimama.insight.trend-topic-overview` | alimama | POST | topicId | 新原生协议 |
| `alimama.insight.trend-topic-keywords` | alimama | POST | topicId | 新原生协议 |
| `alimama.insight.trend-topic-crowd` | alimama | POST | topicId | 新原生协议 |
| `item.category-search` | sycm | GET | keyWord | 原生 GET 候选 |
| `item.diagnose-core` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.profile` | sycm | GET | itemId | 原生 GET 候选 |
| `item.detail-list` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.loss-overview` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.detail-overview` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.main-pic-material` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.rank-live` | sycm | GET | — | 原生 GET 候选 |
| `item.price-info` | sycm | GET | itemId | 原生 GET 候选 |
| `item.sale-overview` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.title-trend` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.title-score` | sycm | GET | itemId | 原生 GET 候选 |
| `item.title-word-list` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.title-word-recommend` | sycm | GET | itemId | 原生 GET 候选 |
| `item.title-words` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.dmp-product` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.dmp-product-top` | sycm | GET | itemIdList, dateRange | 原生 GET 候选 |
| `item.rank` | sycm | GET | dateRange | 原生 GET 候选 |
| `item.sale-live-overview` | sycm | GET | itemId | 原生 GET 候选 |
| `item.sale-live-attributes` | sycm | GET | itemId | 原生 GET 候选 |
| `item.sale-live-skus` | sycm | GET | itemId | 原生 GET 候选 |
| `item.rank-long-period` | sycm | GET | dateRange | 原生 GET 候选 |
| `item.refund-skus` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.super-sku-overview` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.refund-close-overview` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.refund-live-overview` | sycm | GET | itemId | 原生 GET 候选 |
| `item.refund-live-trend` | sycm | GET | itemId | 原生 GET 候选 |
| `item.refund-reasons` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.refund-live-warnings` | sycm | GET | itemId | 原生 GET 候选 |
| `item.flow-source-tree` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.flow-source-tree-v3` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.customer-loss-risk` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.loss-rank` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.price-band` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `item.aftersales-trend` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `competition.active-status` | sycm | GET | — | 原生 GET 候选 |
| `competition.valid-group` | sycm | GET | — | 原生 GET 候选 |
| `competition.group-items` | sycm | GET | sourceType | 原生 GET 候选 |
| `competition.monitored-shops-excluding-great` | sycm | GET | — | 原生 GET 候选 |
| `competition.item-monitor-list` | sycm | GET | — | 原生 GET 候选 |
| `competition.item-state` | sycm | GET | itemId | 原生 GET 候选 |
| `competition.shop-monitor-list` | sycm | GET | — | 原生 GET 候选 |
| `competition.search-drain-detail` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `competition.search-drain-recognition` | sycm | GET | dateRange | 原生 GET 候选 |
| `competition.view-drain-detail` | sycm | GET | itemId, dateRange | 原生 GET 候选 |
| `competition.view-drain-recognition` | sycm | GET | dateRange | 原生 GET 候选 |
| `competition.item-monitor-list-live` | sycm | GET | — | 原生 GET 候选 |
| `competition.shop-monitor-list-live` | sycm | GET | — | 原生 GET 候选 |
| `competitor.shop-core-live` | sycm | GET | sellerId | 原生 GET 候选 |
| `competitor.shop-trend-live` | sycm | GET | sellerId | 原生 GET 候选 |
| `competitor.shop-top-items-live` | sycm | GET | sellerId | 原生 GET 候选 |
| `competitor.shop-highlight` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.shop-operation-summary` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.shop-strategy` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.group-core-indexes` | sycm | GET | groupId, dateRange | 原生 GET 候选 |
| `competitor.shop-core` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.shop-trend` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.shop-flow-source` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.shop-search-words` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.shop-crowd` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.shop-top-items` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.shop-profile-check` | sycm | GET | sellerId | 原生 GET 候选 |
| `competitor.shop-profile` | sycm | GET | sellerId | 原生 GET 候选 |
| `competitor.shop-flow-origin` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.shop-flow-overview` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `competitor.shop-flow-paid` | sycm | GET | sellerId, dateRange | 原生 GET 候选 |
| `shop.trade-summary` | sycm-trade | GET | dateRange | 原生 GET 候选 |
| `shop.trade-categories` | sycm-trade | GET | dateRange | 原生 GET 候选 |
| `shop.trade-trend` | sycm-trade | GET | categoryId, dateRange, indexs | 原生 GET 候选 |
| `dmp.shop-standard-categories` | dmp | GET | — | 新原生协议 |
| `dmp.shop-categories` | dmp | GET | endDate | 新原生协议 |
| `dmp.shop-date-range` | dmp | GET | — | 新原生协议 |
| `dmp.shop-item-indicators` | dmp | GET | — | 新原生协议 |
| `dmp.shop-items` | dmp | GET | endDate | 新原生协议 |
| `dmp.shop-labels` | dmp | GET | — | 新原生协议 |
| `dmp.shop-overview` | dmp | GET | endDate | 新原生协议 |
| `coupon.page-detail` | coupon | GET | — | 新原生协议 |
| `coupon.fee-init` | coupon | GET | — | 新原生协议 |
| `coupon.fee-groups` | coupon | GET | startTime, endTime | 新原生协议 |
| `coupon.fee-rule` | coupon | GET | date | 新原生协议 |
| `coupon.fee-rules` | coupon | GET | startTime, endTime | 新原生协议 |
| `coupon.day-fee-summary` | coupon | GET | time | 新原生协议 |
| `coupon.day-fee-detail` | coupon | GET | time | 新原生协议 |
| `coupon.day-fee-list` | coupon | GET | startTime, endTime | 新原生协议 |
| `coupon.detail-day-list` | coupon | GET | startTime, endTime | 新原生协议 |
| `coupon.download-tasks` | coupon | GET | processorKey, domainId | 新原生协议 |
| `category.tree` | sycm | GET | — | 原生 GET 候选 |
| `category.main` | sycm | GET | — | 原生 GET 候选 |
| `market.item-rank` | sycm | GET | cateId, dateRange | 原生 GET 候选 |
| `market.item-flow-rank` | sycm | GET | cateId, dateRange | 原生 GET 候选 |
| `market.item-add-rank` | sycm | GET | cateId, dateRange | 原生 GET 候选 |
| `market.price-segments` | sycm | GET | cateId, dateRange | 原生 GET 候选 |
| `market.keyword-rank` | sycm | GET | cateId, dateRange | 原生 GET 候选 |
| `word.overview` | sycm | GET | keyword, dateRange | 原生 GET 候选 |
| `word.trend` | sycm | GET | keyword, dateRange | 原生 GET 候选 |
| `word.related` | sycm | GET | keyWord, dateRange | 原生 GET 候选 |
| `word.category` | sycm | GET | keyWord, dateRange | 原生 GET 候选 |
