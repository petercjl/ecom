const rows = [
  ['alimama-insight', 'alimama', 'fetch-analysis', '行业、竞争、流量与趋势洞察', ['categoryOrKeyword', 'dateRange'], ['insightData']],
  ['alimama-onebp-campaign-data', 'alimama', 'fetch', '万相台活动、报表、预测与预算建议', ['dateRange'], ['campaigns', 'report', 'predictions']],
  ['category-best-selling-items-analysis', 'category', 'analysis', '类目热销商品及特征分析', ['category', 'dateRange'], ['featureSummary']],
  ['category-info-query', 'category', 'fetch', '类目搜索、层级与名称查询', ['categoryIdOrKeyword'], ['categories']],
  ['category-keyword-analysis', 'category', 'analysis', '类目关键词规模、效率与机会分析', ['category', 'dateRange'], ['keywordAnalysis']],
  ['category-market-analysis', 'category', 'analysis', '品牌、价格带、卖点与竞争格局分析', ['topItems', 'priceSegments'], ['marketStructure']],
  ['category-market-insight', 'category', 'workflow', '类目市场洞察完整工作流', ['category', 'dateRange'], ['report', 'detailData']],
  ['category-price-band-analysis', 'category', 'analysis', '类目价格带分布与机会分析', ['category', 'dateRange'], ['priceBandAnalysis']],
  ['category-top-items-fetch', 'category', 'fetch', '类目榜单商品分价格带取数', ['category', 'dateRange'], ['topItems']],
  ['category-top-items-profile', 'category', 'analysis', '类目头部商品画像', ['category', 'dateRange'], ['itemProfile']],
  ['category-top-shops-profile', 'category', 'analysis', '类目头部店铺画像', ['category', 'dateRange'], ['shopProfile']],
  ['competitor-comparison-action-tracking', 'competitor', 'workflow', '竞店竞品对比与运营动作跟踪', ['competitors', 'dateRange'], ['comparison', 'actions']],
  ['competitor-shop-analysis', 'competitor', 'analysis', '竞店核心指标、流量与商品对比', ['shopIds', 'dateRange'], ['shopComparison']],
  ['comprehensive-product-data-analysis', 'item', 'workflow', '单品销售、流量、转化、客群综合诊断', ['itemId', 'dateRange'], ['itemDiagnosis']],
  ['daily-shop-inspection', 'shop', 'workflow', '店铺日常巡检与风险建议', ['date'], ['inspectionReport']],
  ['dmp-shop-insight', 'dmp', 'fetch-analysis', '达摩盘全店货品经营洞察', ['dateRange'], ['shopInsight']],
  ['item-gallery-analysis', 'item', 'analysis', '商品主图表现与结构分析', ['itemId', 'dateRange'], ['galleryAnalysis']],
  ['item-ops-event-impact-analysis', 'item', 'analysis', '运营动作前后影响分析', ['itemId', 'eventDate'], ['impactAnalysis']],
  ['item-promotion-analysis', 'promotion', 'analysis', '商品付费推广效果分析', ['itemId', 'dateRange'], ['promotionAnalysis']],
  ['item-search-word-fetch', 'item', 'fetch', '商品全量搜索词与核心词取数', ['itemId', 'dateRange'], ['searchWords']],
  ['item-traffic-analysis', 'item', 'analysis', '商品渠道流量结构分析', ['itemId', 'dateRange'], ['trafficAnalysis']],
  ['item-traffic-fluctuation-analysis', 'item', 'analysis', '商品流量异动定位', ['itemId', 'dateRange'], ['fluctuationAnalysis']],
  ['market-blue-ocean-opportunity-mining', 'market', 'analysis', '蓝海类目与关键词机会发现', ['categoryScope', 'dateRange'], ['opportunities']],
  ['marketing-price-check-pro', 'promotion', 'workflow', '本地价盘与线上价格批量核对', ['priceSheet', 'date'], ['priceRiskReport']],
  ['mkt_insight-consumer-couponfee', 'promotion', 'fetch', '消费券费用、订单与结算明细查询', ['dateRange'], ['couponFees', 'orders']],
  ['mkt_insight-marketing-knowledge', 'promotion', 'knowledge', '营销与价格规则知识问答', ['question'], ['answer']],
  ['shop-core-index-analysis', 'shop', 'analysis', '店铺销售、流量与转化核心指标分析', ['dateRange'], ['coreIndexAnalysis']],
  ['shop-core-potential-item-analysis', 'shop', 'analysis', '核心品、潜力品与引流款识别', ['dateRange'], ['itemPortfolio']],
  ['shop-inspection-problem-info', 'shop', 'fetch', '店铺巡检预警与异常项查询', ['date'], ['problems']],
  ['sycm-category-query', 'category', 'fetch', '批量类目 ID 转名称', ['categoryIds'], ['categoryNames']],
  ['sycm-flow-itemsource-helper', 'item', 'fetch', '商品流量来源、趋势与下钻查询', ['itemId', 'dateRange'], ['trafficSources']],
  ['sycm-item-competitor-analysis', 'competitor', 'fetch-analysis', '本品与竞品指标、趋势、来源、搜索词对比', ['itemId', 'competitorItemIds', 'dateRange'], ['competitorData']],
  ['sycm-item-data-fetch', 'item', 'fetch', '商品排行、销售、退款、价格、标题、详情、流量和客群取数', ['itemIdOrScope', 'dateRange'], ['itemData']],
  ['sycm-item-rank-helper', 'item', 'workflow', '店铺商品排行与单品分析入口', ['scope', 'dateRange'], ['itemRanking']],
  ['sycm-market', 'market', 'fetch', '类目、市场排行、搜索排行与搜索词取数', ['categoryOrKeyword', 'dateRange'], ['marketData']],
  ['sycm-market-competitive-product', 'competitor', 'fetch', '竞品流失、竞争监控与竞店数据取数', ['scope', 'dateRange'], ['competitionData']],
  ['weekly-or-monthly-store-performance-reports', 'report', 'report', '店铺经营周报或月报', ['period'], ['markdownReport']]
];

export const businessCapabilities = rows.map(([id, domain, kind, summary, inputs, outputs]) => ({
  id, domain, kind, summary, inputs, outputs, sideEffect: 'none'
}));

export const mutationCapabilities = [
  { id: 'qianniu-product-batch-draft', domain: 'product', summary: '批量创建商品草稿', requiredFields: ['products'], entryUrl: 'https://myseller.taobao.com/', steps: ['validate-products', 'open-product-draft-editor', 'create-drafts-only', 'read-back-draft-ids'], verification: 'Every requested product has a returned draft ID; no product is published.' },
  { id: 'product-migration-guide', domain: 'product', summary: '商品迁移与发布配置', requiredFields: ['sourceProducts', 'targetMode'], entryUrl: 'https://myseller.taobao.com/', steps: ['read-source-products', 'validate-target-category-and-properties', 'create-target-drafts', 'read-back-draft-ids'], verification: 'Target drafts exist and retain the approved category, SKU, media and price configuration.' },
  { id: 'search-recommend-publish', domain: 'publish', summary: '搜索推荐内容发布', requiredFields: ['content', 'target'], entryUrl: 'https://myseller.taobao.com/', steps: ['validate-content-and-target', 'open-search-recommend-publisher', 'preview', 'publish', 'read-back-publication-status'], verification: 'Publication ID, target and status match the authorized plan.' },
  { id: 'video-publish-item', domain: 'publish', summary: '商品视频发布', requiredFields: ['itemId', 'video'], entryUrl: 'https://myseller.taobao.com/', steps: ['validate-item-and-video', 'open-item-video-editor', 'upload-or-select-video', 'preview', 'publish', 'read-back-video-status'], verification: 'The bound item shows the expected video identifier and processing or published status.' },
  { id: 'sucai-apply', domain: 'material', summary: '素材应用到商品或内容', requiredFields: ['materials', 'target'], entryUrl: 'https://myseller.taobao.com/', steps: ['validate-materials-and-target', 'open-material-workspace', 'preview-assignment', 'apply', 'read-back-assignment'], verification: 'The target contains exactly the authorized material identifiers and positions.' },
  { id: 'shop-index-hosting-manager_2', domain: 'shop', summary: '店铺指标托管配置', requiredFields: ['settings'], entryUrl: 'https://myseller.taobao.com/', steps: ['read-current-settings', 'diff-settings', 'preview', 'apply-settings', 'read-back-settings'], verification: 'Read-back settings equal the authorized settings diff.' },
  { id: 'mkt_insight-a2ui-price-plan-upload-card', domain: 'promotion', summary: '价格方案上传与应用', requiredFields: ['pricePlan'], entryUrl: 'https://myseller.taobao.com/', steps: ['validate-price-plan', 'open-price-plan-uploader', 'upload-and-parse', 'preview-price-diff', 'apply', 'read-back-price-plan-status'], verification: 'Accepted rows, rejected rows, plan ID and effective status are returned.' }
].map((entry) => ({ ...entry, kind: 'mutation', sideEffect: 'write', planRequired: true, applyConfirmationRequired: true, excludedActions: ['delete', 'refund', 'cancel', 'account', 'permission', 'payment'] }));

export function findBusinessCapability(id) {
  return [...businessCapabilities, ...mutationCapabilities].find((entry) => entry.id === id) || null;
}
