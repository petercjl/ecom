import { CliError, invariant } from './errors.mjs';

const operations = [
  ['competitor.core-indexes', 'sycm', 'GET', '/mc/mq/rivalItem/analysis/getCoreIndexes.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['competitor.core-trend', 'sycm', 'GET', '/mc/mq/rivalItem/analysis/getCoreTrend.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['competitor.search', 'sycm', 'GET', '/mc/ci/free/index/rival/item/search.json', ['keyWord']],
  ['competitor.recommend', 'sycm', 'GET', '/mc/free/rivalShop/recommend/index/item.json', ['itemId']],
  ['competitor.flow-origin', 'sycm', 'GET', '/mc/rivaItem/analysis/getFlowSource/origin/v4/free.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['competitor.flow-paid', 'sycm', 'GET', '/mc/rivalItem/getFlowsource/qzt/participate/free.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['competitor.flow-source', 'sycm', 'GET', '/mc/mq/rivalItem/analysis/getFlowSource/v4.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['competitor.search-words', 'sycm', 'GET', '/mc/mq/rivalItem/analysis/getSearchWords.json', ['itemId', 'rivalItemId', 'dateRange']],
  ['alimama.access', 'alimama', 'POST', '/member/checkAccess.json', [], { encoding: 'json', defaultParams: { bizCode: 'universalBP', r: 'mx_13' } }],
  ['alimama.campaigns', 'alimama', 'POST', '/campaign/horizontal/findPage.json', [], { encoding: 'json' }],
  ['alimama.multi-target-campaigns', 'alimama', 'POST', '/campaign/onebpSite/multiTargCampaignFindPage.json', [], { encoding: 'json' }],
  ['alimama.member-config', 'alimama', 'POST', '/member/getMemberConfig.json', [], { encoding: 'json' }],
  ['alimama.report-config', 'alimama', 'POST', '/report/getReportConfig.json', [], { encoding: 'json' }],
  ['alimama.report', 'alimama', 'POST', '/report/query.json', [], { encoding: 'json' }],
  ['alimama.effect-prediction', 'alimama', 'POST', '/algo/listEffectPrediction.json', [], { encoding: 'json' }],
  ['alimama.budget-suggestion', 'alimama', 'POST', '/algo/getBatchBudgetSuggestion.json', [], { encoding: 'json' }]
];

const alimamaInsightOperations = [
  ['alimama.insight.industry-categories', 1638, 'onebpSearch', [], {}],
  ['alimama.insight.industry-strategy', 1932, 'universalBP', [], { dateType: '7' }],
  ['alimama.insight.industry-profile', 1833, 'universalBP', [], {}],
  ['alimama.insight.industry-subcategories', 1640, 'onebpSearch', ['cateLevel1Id'], { cateLevel1Name: '', dateType: '7' }],
  ['alimama.insight.industry-traffic-kpi', 1749, 'onebpSearch', ['cateLevel1Id'], {}],
  ['alimama.insight.industry-traffic-chart', 1781, 'universalBP', ['cateLevel1Id'], {}],
  ['alimama.insight.industry-daily-interpretation', 1748, 'universalBP', ['cateLevel1Id', 'startTime', 'endTime', 'vsStartTime', 'vsEndTime'], {}],
  ['alimama.insight.industry-daily-chart', 1782, 'universalBP', ['cateLevel1Id', 'startTime', 'endTime', 'vsStartTime', 'vsEndTime'], {}],
  ['alimama.insight.industry-opportunities', 1528, 'universalBP', ['cateLevel1Id', 'cateLevel1Name', 'cateLevel2Id', 'cateLevel2Name'], { dateType: 7 }],
  ['alimama.insight.compete-default-category', 1523, 'universalBP', [], {}],
  ['alimama.insight.compete-market-penetration', 5589, 'universalBP', ['catelv2Id'], { wordType: 'E', dataType: 1 }],
  ['alimama.insight.compete-bubble-chart', 5686, 'universalBP', ['catelv2Id'], { wordType: 'E', dataType: 1 }],
  ['alimama.insight.compete-my-items', 5958, 'universalBP', ['catelv2Id'], {}],
  ['alimama.insight.compete-excellent-items', 5961, 'universalBP', ['catelv2Id'], { custLevel: '不限', cmpId: '3' }],
  ['alimama.insight.traffic-shop-categories', 870, 'universalBP', [], {}],
  ['alimama.insight.traffic-rank-list', 1463, 'universalBP', [], { needGray: true, isWordRankShow: 1 }],
  ['alimama.insight.traffic-hot-words', 1524, 'universalBP', [], { needGray: true }],
  ['alimama.insight.traffic-favorites', 1464, 'universalBP', [], {}],
  ['alimama.insight.trend-topic-list', 6687, 'onebpSearch', [], { tab: 'member_item_search' }],
  ['alimama.insight.trend-topic-overview', 15884, 'onebpSearch', ['topicId'], { topicName: '', topicCate: '', brandSource: '', brandType: '', tab: 'member_item_search' }],
  ['alimama.insight.trend-topic-keywords', 15899, 'onebpSearch', ['topicId'], { topicName: '', topicCate: '', brandSource: '', brandType: '', tab: 'member_item_search' }],
  ['alimama.insight.trend-topic-crowd', 4273, 'onebpSearch', ['topicId'], { topicName: '', topicCate: '', brandSource: '', brandType: '', tab: 'member_item_search' }]
].map(([id, moduleId, bizCode, requiredParams, defaultParams]) => [id, 'alimama', 'POST', '/cube/triggerDynamicModule.json', requiredParams, {
  encoding: 'json', requestShape: 'alimama-dynamic-module', moduleId, bizCode, accessBizCode: 'universalBP', defaultParams
}]);

operations.push(...alimamaInsightOperations);

const sycmItemOperations = [
  ['item.category-search', '/cc/common/category/getStdCate.json', ['keyWord']],
  ['item.diagnose-core', '/cc/diagnose/coreIndex.json', ['itemId', 'dateRange'], { defaultParams: { dateType: 'recent30', crowdType: 'all' } }],
  ['item.profile', '/cc/item/archive/profile.json', ['itemId']],
  ['item.detail-list', '/cc/item/detail/analysis/list.json', ['itemId', 'dateRange'], { defaultParams: { dateType: 'day', byrType: 'all' } }],
  ['item.loss-overview', '/cc/item/detail/analysis/loss/overview.json', ['itemId', 'dateRange']],
  ['item.detail-overview', '/cc/item/detail/analysis/overview.json', ['itemId', 'dateRange'], { defaultParams: { dateType: 'day', byrType: 'all' } }],
  ['item.main-pic-material', '/cc/item/detail/main/pic/analysis/material.json', ['itemId', 'dateRange'], { defaultParams: { dateType: 'day', byrType: 'all', orderBy: 'itemExposeUv', order: 'desc', page: '1', pageSize: '10', contentType: '', indexCode: 'itemExposeUv,itemInteractUv,itemPayUv,itemLossUv,itemLossRate,itemPayConvertRate' } }],
  ['item.rank-live', '/cc/item/live/view/top.json', []],
  ['item.price-info', '/cc/item/price/info.json', ['itemId']],
  ['item.sale-overview', '/cc/item/sale/overview.json', ['itemId', 'dateRange'], { defaultParams: { dateType: 'day', device: '0' } }],
  ['item.title-trend', '/cc/item/title/v2/diagnosis/trend.json', ['itemId', 'dateRange']],
  ['item.title-score', '/cc/item/title/v2/titleScore.json', ['itemId']],
  ['item.title-word-list', '/cc/item/title/v2/word/list.json', ['itemId', 'dateRange']],
  ['item.title-word-recommend', '/cc/item/title/v2/word/recommend.json', ['itemId']],
  ['item.title-words', '/cc/item/v2/getTitleWords.json', ['itemId', 'dateRange']],
  ['item.dmp-product', '/cc/item/view/dmp/newproduct.json', ['itemId', 'dateRange']],
  ['item.dmp-product-top', '/cc/item/view/dmp/newproduct/top.json', ['itemIdList', 'dateRange']],
  ['item.rank', '/cc/item/view/top.json', ['dateRange'], { defaultParams: { dateType: 'recent7', page: '1', pageSize: '20' } }],
  ['item.sale-live-overview', '/cc/live/item/sale/overview.json', ['itemId']],
  ['item.sale-live-attributes', '/cc/live/item/sale/sku/attrDetail.json', ['itemId']],
  ['item.sale-live-skus', '/cc/live/v2/item/sale/sku/list.json', ['itemId']],
  ['item.rank-long-period', '/cc/long/period/nodistinct/item/view/top.json', ['dateRange']],
  ['item.refund-skus', '/cc/refund/item/sku/list.json', ['itemId', 'dateRange']],
  ['item.super-sku-overview', '/cc/supersku/overview.json', ['itemId', 'dateRange']],
  ['item.refund-close-overview', '/csp/api/refund/item/close/overview.json', ['itemId', 'dateRange']],
  ['item.refund-live-overview', '/csp/api/refund/item/live/overview.json', ['itemId']],
  ['item.refund-live-trend', '/csp/api/refund/item/live/trend.json', ['itemId']],
  ['item.refund-reasons', '/csp/api/refund/item/reason/list/v2.json', ['itemId', 'dateRange']],
  ['item.refund-live-warnings', '/csp/api/refund/item/warn/live.json', ['itemId']],
  ['item.flow-source-tree', '/flow/item/source/tree/support.json', ['itemId', 'dateRange'], { defaultParams: { dateType: 'day', orderBy: 'uv', order: 'desc', page: '1', pageSize: '10', activateBoost: 'sourceChannel', crowdType: 'all', flowBizType: 'classic', indexCode: 'uv,cltItmCnt,cartByrCnt,payByrCnt' } }],
  ['item.flow-source-tree-v3', '/flow/v6/item/crowdtype/source/v3.json', ['itemId', 'dateRange'], { defaultParams: { dateType: 'day', device: '2', belong: 'all', orderBy: 'uv', order: 'desc', page: '1', pageSize: '10', indexCode: 'uv,cartByrCnt,payByrCnt' } }],
  ['item.customer-loss-risk', '/mc/item/customers/lossrisk.json', ['itemId', 'dateRange']],
  ['item.loss-rank', '/mc/item/detail/analysis/loss/rank.json', ['itemId', 'dateRange']],
  ['item.price-band', '/mc/item/price/band/info/v3.json', ['itemId', 'dateRange']],
  ['item.aftersales-trend', '/qos/aftersales/item/trend.json', ['itemId', 'dateRange']]
].map(([id, path, requiredParams, options]) => [id, 'sycm', 'GET', path, requiredParams, options]);

const sycmCompetitionOperations = [
  ['competition.active-status', '/mc/ci/free/active/status.json', []],
  ['competition.valid-group', '/mc/ci/free/config/rival/group/hasValidGroup.json', []],
  ['competition.group-items', '/mc/ci/free/config/rival/group/listItemsBySourceType.json', ['sourceType']],
  ['competition.monitored-shops-excluding-great', '/mc/ci/free/config/rival/shop/getMonitoredListExcludeGreatShop.json', []],
  ['competition.item-monitor-list', '/mc/ci/free/item/monitor/list/page.json', []],
  ['competition.item-state', '/mc/ci/free/item/state.json', ['itemId']],
  ['competition.shop-monitor-list', '/mc/ci/free/v2/shop/monitor/listShop/page.json', []],
  ['competition.search-drain-detail', '/mc/free/ci/item/search/drain/detail.json', ['itemId', 'dateRange']],
  ['competition.search-drain-recognition', '/mc/free/ci/item/search/drain/recognition.json', ['dateRange']],
  ['competition.view-drain-detail', '/mc/free/ci/item/view/drain/detail.json', ['itemId', 'dateRange']],
  ['competition.view-drain-recognition', '/mc/free/ci/item/view/drain/recognition.json', ['dateRange']],
  ['competition.item-monitor-list-live', '/mc/free/live/ci/item/monitor/list/page.json', []],
  ['competition.shop-monitor-list-live', '/mc/free/live/ci/shop/monitor/listShop/page.json', []],
  ['competitor.shop-core-live', '/mc/free/rivalShop/analysis/getCoreIndexesLive.json', ['sellerId']],
  ['competitor.shop-trend-live', '/mc/free/rivalShop/analysis/getCoreTrendLive.json', ['sellerId']],
  ['competitor.shop-top-items-live', '/mc/free/rivalShop/analysis/getLiveTopItems/page.json', ['sellerId']],
  ['competitor.shop-highlight', '/mc/mq/mkt/offline/rival/highlight.json', ['sellerId', 'dateRange']],
  ['competitor.shop-operation-summary', '/mc/mq/mkt/offline/rival/operation/summary.json', ['sellerId', 'dateRange']],
  ['competitor.shop-strategy', '/mc/mq/mkt/offline/rival/strategy.json', ['sellerId', 'dateRange']],
  ['competitor.group-core-indexes', '/mc/mq/rivalItem/analysis/group/getCoreIndexes.json', ['groupId', 'dateRange']],
  ['competitor.shop-core', '/mc/mq/rivalShop/analysis/getCoreIndexes.json', ['sellerId', 'dateRange']],
  ['competitor.shop-trend', '/mc/mq/rivalShop/analysis/getCoreTrend.json', ['sellerId', 'dateRange']],
  ['competitor.shop-flow-source', '/mc/mq/rivalShop/analysis/getFlowSource/v4.json', ['sellerId', 'dateRange']],
  ['competitor.shop-search-words', '/mc/mq/rivalShop/analysis/getSearchWords.json', ['sellerId', 'dateRange']],
  ['competitor.shop-crowd', '/mc/mq/rivalShop/analysis/getShopCrowd.json', ['sellerId', 'dateRange']],
  ['competitor.shop-top-items', '/mc/mq/rivalShop/analysis/getTopItems/page.json', ['sellerId', 'dateRange']],
  ['competitor.shop-profile-check', '/mc/mq/rivalShop/checkProfile.json', ['sellerId']],
  ['competitor.shop-profile', '/mc/mq/rivalShop/profile/detail.json', ['sellerId']],
  ['competitor.shop-flow-origin', '/mc/rivalShop/analysis/getFlowSource/origin/v4/free.json', ['sellerId', 'dateRange']],
  ['competitor.shop-flow-overview', '/mc/rivalShop/analysis/getFlowSource/overview/v4.json', ['sellerId', 'dateRange']],
  ['competitor.shop-flow-paid', '/mc/rivalShop/getFlowsource/qzt/participate/free.json', ['sellerId', 'dateRange']]
].map(([id, path, requiredParams]) => [id, 'sycm', 'GET', path, requiredParams]);

operations.push(...sycmItemOperations, ...sycmCompetitionOperations);

operations.push(
  ['shop.trade-summary', 'sycm-trade', 'GET', '/bda/tradinganaly/overview/get_summary.json', ['dateRange'], { defaultParams: { dateType: 'recent7', device: '0' } }],
  ['shop.trade-categories', 'sycm-trade', 'GET', '/bda/tradinganaly/overview/getCateTop.json', ['dateRange'], { defaultParams: { dateType: 'recent7' } }],
  ['shop.trade-trend', 'sycm-trade', 'GET', '/bda/tradinganaly/overview/getTendency.json', ['categoryId', 'dateRange', 'indexs'], { defaultParams: { dateType: 'recent7', device: '0', diff: '0' } }]
);

operations.push(
  ['dmp.shop-standard-categories', 'dmp', 'GET', '/api/dmp/shop/std/cate', [], { defaultParams: { cateModel: '2', filterModel: '0' } }],
  ['dmp.shop-categories', 'dmp', 'GET', '/api/goods/cate/list', ['endDate'], { defaultParams: { period: '30', page: '1', pageSize: '10' } }],
  ['dmp.shop-date-range', 'dmp', 'GET', '/api/goods/shop/dateRange', []],
  ['dmp.shop-item-indicators', 'dmp', 'GET', '/api/goods/shop/item/indicators', [], { defaultParams: { type: '1' } }],
  ['dmp.shop-items', 'dmp', 'GET', '/api/goods/shop/item/list', ['endDate'], { defaultParams: { period: '30', page: '1', pageSize: '20' } }],
  ['dmp.shop-labels', 'dmp', 'GET', '/api/goods/shop/label/list', []],
  ['dmp.shop-overview', 'dmp', 'GET', '/api/goods/shop/v3/overview', ['endDate'], { defaultParams: { period: '30', benchmark: '0' } }]
);

operations.push(
  ['coupon.page-detail', 'coupon', 'GET', '/consumercoupon/renderCouponPageDetailView.do', []],
  ['coupon.fee-init', 'coupon', 'GET', '/consumercoupon/getFeeInitInfo.do', []],
  ['coupon.fee-groups', 'coupon', 'GET', '/consumercoupon/getFeeGroupList.do', ['startTime', 'endTime']],
  ['coupon.fee-rule', 'coupon', 'GET', '/consumercoupon/getFeeRuleInfo.do', ['date']],
  ['coupon.fee-rules', 'coupon', 'GET', '/consumercoupon/getFeeRuleInfoList.do', ['startTime', 'endTime']],
  ['coupon.day-fee-summary', 'coupon', 'GET', '/consumercoupon/getDayFeeInfo.do', ['time']],
  ['coupon.day-fee-detail', 'coupon', 'GET', '/consumercoupon/getDayFeeInfoDetail.do', ['time']],
  ['coupon.day-fee-list', 'coupon', 'GET', '/consumercoupon/getDayFeeInfoListV2.do', ['startTime', 'endTime']],
  ['coupon.detail-day-list', 'coupon', 'GET', '/consumercoupon/getDayVOList.do', ['startTime', 'endTime']],
  ['coupon.download-tasks', 'coupon', 'GET', '/list/asyncTaskList/queryListData.do', ['processorKey', 'domainId']]
);

const services = {
  sycm: { origin: 'https://sycm.taobao.com', entryUrl: 'https://sycm.taobao.com/mc/mq/market_monitor.htm', hosts: ['sycm.taobao.com'], tokenStrategy: 'sycm-meta' },
  'sycm-trade': { origin: 'https://sycm.taobao.com', entryUrl: 'https://sycm.taobao.com/fa/trade/detail?activeKey=overview', hosts: ['sycm.taobao.com'], tokenStrategy: 'sycm-meta' },
  alimama: { origin: 'https://one.alimama.com', entryUrl: 'https://one.alimama.com/', hosts: ['one.alimama.com'], tokenStrategy: 'alimama-access' },
  dmp: { origin: 'https://dmp.advgateway.taobao.com', entryUrl: 'https://dmp.taobao.com/index_new.html#!/items/shop-insight', hosts: ['dmp.taobao.com'], tokenStrategy: 'dmp-magix' },
  coupon: { origin: 'https://sale.taobao.com', entryUrl: 'https://myseller.taobao.com/home.htm/coupon_marketing/home?tab=fee', hosts: ['myseller.taobao.com', 'sale.taobao.com'], matchPath: '/home.htm/coupon_marketing/', tokenStrategy: 'taobao-cookie' }
};

export const operationRegistry = Object.freeze(Object.fromEntries(operations.map(([id, service, method, path, requiredParams, options = {}]) => [id, {
  id, service, method, path, requiredParams, sideEffect: 'none', ...options
}])));

export function getService(id) {
  const service = services[id];
  if (!service) throw new CliError('UNKNOWN_SERVICE', `Unknown browser service: ${id}`, { exitCode: 2 });
  return service;
}

export function getOperation(id) {
  const operation = operationRegistry[id];
  if (!operation) throw new CliError('UNKNOWN_OPERATION', `Unknown registered operation: ${id}`, { exitCode: 2, hint: 'Run sycmcli data operations.' });
  return operation;
}

export function validateOperationParams(operation, params) {
  invariant(params && typeof params === 'object' && !Array.isArray(params), 'INVALID_ARGUMENT', 'Operation params must be a JSON object.', { exitCode: 2 });
  const missing = operation.requiredParams.filter((key) => params[key] === undefined || params[key] === null || params[key] === '');
  invariant(missing.length === 0, 'MISSING_ARGUMENT', `Missing operation parameters: ${missing.join(', ')}.`, { exitCode: 2 });
  if (operation.id.startsWith('alimama.insight.industry-')) {
    if (params.dateType !== undefined) invariant([7, 15, 30, '7', '15', '30'].includes(params.dateType), 'INVALID_ARGUMENT', 'Industry dateType must be 7, 15, or 30.', { exitCode: 2 });
    for (const key of ['startTime', 'endTime', 'vsStartTime', 'vsEndTime']) {
      const value = params[key];
      if (value !== undefined && value !== null) invariant(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'INVALID_ARGUMENT', `${key} must be a valid YYYY-MM-DD date.`, { exitCode: 2 });
    }
    if (params.startTime && params.endTime) invariant(params.startTime <= params.endTime, 'INVALID_ARGUMENT', 'startTime must not follow endTime.', { exitCode: 2 });
    if (params.vsStartTime && params.vsEndTime) invariant(params.vsStartTime <= params.vsEndTime, 'INVALID_ARGUMENT', 'vsStartTime must not follow vsEndTime.', { exitCode: 2 });
  }
  return params;
}

export function listOperations() {
  return Object.values(operationRegistry).map((operation) => ({ ...operation, ...getService(operation.service), origin: getService(operation.service).origin }));
}
