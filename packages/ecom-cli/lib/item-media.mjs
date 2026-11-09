import path from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {callMailbox, discover, readMailbox, resolveContainer} from './browser.mjs';
import {cdpCommand} from './cdp.mjs';
import {exists, fail, writeNew} from './common.mjs';

const detailPath = '/h5/mtop.taobao.detail.getdesc/7.0/';
const blocked = /FAIL_SYS_USER_VALIDATE|RGV587|SESSION_EXPIRED|ILLEGAL_ACCESS|TOKEN_EXPIRED|TOKEN_EMPTY/;
const productHosts = new Set(['item.taobao.com', 'detail.tmall.com']);
const domain = (host, suffix) => host === suffix || host.endsWith('.' + suffix);

export function validateItemMediaOptions(options) {
  if (!options.container?.trim() || !/^\d{1,30}$/.test(options['item-id'] ?? '') ||
      path.extname(options.out ?? '').toLowerCase() !== '.json') {
    throw fail('INVALID_ARGUMENT', 'Specify --container, --item-id (digits), and --out NEW.json');
  }
}

function itemUrl(options) {
  const itemId = options['item-id'];
  if (!options.url) return 'https://item.taobao.com/item.htm?id=' + itemId;
  if (isProductUrl(options.url, itemId)) return options.url;
  throw fail('INVALID_ARGUMENT', '--url must be a Taobao or Tmall item URL with the matching --item-id');
}

export function isProductUrl(value, itemId) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && productHosts.has(url.hostname) &&
        !url.username && !url.password && !url.port && url.pathname === '/item.htm' &&
        url.searchParams.getAll('id').length === 1 && url.searchParams.get('id') === itemId;
  } catch {
    return false;
  }
}

function assetUrl(value, video = false) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, 'https://item.taobao.com');
    const imageHost = ['alicdn.com', 'taobaocdn.com', 'tbcdn.cn'].some(x => domain(url.hostname, x));
    if (!imageHost && !(video && domain(url.hostname, 'taobao.com'))) return null;
    if (url.username || url.password || url.port || !['http:', 'https:'].includes(url.protocol)) return null;
    if (url.protocol === 'http:' && video &&
        !(url.hostname === 'cloud.video.taobao.com' && url.pathname.startsWith('/play/'))) return null;
    url.protocol = 'https:';
    if (!video) { url.search = ''; url.hash = ''; }
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeItemMedia(state, itemId) {
  if (String(state.item?.itemId) !== itemId) throw fail('ITEM_ID_MISMATCH', 'Product state belongs to another item');
  const properties = state.props?.map(property => ({
    pid: String(property.pid), name: property.name,
    values: (property.values ?? []).map(value => ({
      vid: String(value.vid), name: value.name, imageUrl: assetUrl(value.image),
    })),
  })) ?? null;
  const skus = (state.skus ?? []).map(sku => {
    const options = String(sku.propPath ?? '').split(';').filter(Boolean).map(pair => {
      const [pid, vid] = pair.split(':');
      const property = properties?.find(entry => entry.pid === pid);
      const value = property?.values.find(entry => entry.vid === vid);
      return {pid, vid, property: property?.name ?? null, name: value?.name ?? null, imageUrl: value?.imageUrl ?? null};
    });
    return {skuId: String(sku.skuId), propPath: sku.propPath, options, imageUrls: options.map(option => option.imageUrl).filter(Boolean)};
  });
  const records = [];
  const videos = Array.isArray(state.videos) ? state.videos : null;
  for (const [sourceIndex, video] of (videos ?? []).entries()) {
    const url = assetUrl(typeof video === 'string' ? video : video?.url ?? video?.videoUrl ?? video?.videoPlayUrl ?? video?.playUrl, true);
    if (!url) continue;
    const posterUrl = assetUrl(video?.videoThumbnailURL ?? video?.coverUrl ?? video?.videoCover ?? video?.cover ?? video?.picUrl);
    records.push({url, sourceIndex, ...(posterUrl ? {posterUrl} : {})});
  }
  const status = !videos ? 'unavailable' : videos.length === 0 ? 'absent' : records.length === videos.length ? 'captured' : 'partial';
  return {
    detail: {itemId, title: state.item.title ?? null, shop: state.shop,
      mainImages: (state.item.images ?? []).map(value => assetUrl(value)).filter(Boolean), properties, skus},
    mainVideos: {status, records, sourceCount: videos?.length ?? null},
  };
}

export function readDescription(text, itemId) {
  const input = text.trim();
  const payload = JSON.parse(input.match(/^[\w.$]+\s*\(([\s\S]*)\)\s*;?$/)?.[1] ?? input);
  if (payload.ret?.some(value => blocked.test(value))) throw fail('TAOBAO_ACCESS_RESTRICTED', 'Taobao restricted access in the selected container');
  if (!payload.ret?.some(value => value.startsWith('SUCCESS'))) throw fail('DESCRIPTION_API_FAILED', 'The product description API did not succeed');
  const components = payload.data?.components;
  const models = components?.componentData;
  const supported = ['desc_richtext', 'desc_richtext_pc', 'desc_single_image'];
  const layout = Array.isArray(components?.layout) ? components.layout : [];
  const nodes = layout.filter(node => supported.includes(node.key) && !String(node.ID).startsWith('detail_pic_tmallPriceDesc_'));
  if (!nodes.length && models?.desc_richtext_pc) nodes.push({ID:'desc_richtext_pc', key:'desc_richtext_pc'});
  if (!nodes.length) throw fail('DESCRIPTION_SCHEMA_CHANGED', 'The description response does not have a recognized image layout');
  const images = [];
  for (const node of nodes) {
    const model = models?.[node.ID]?.model;
    if (model?.itemId != null && String(model.itemId) !== itemId) throw fail('ITEM_ID_MISMATCH', 'Description belongs to another item');
    if (node.key === 'desc_single_image') {
      const url = assetUrl(model?.picUrl);
      if (!url) throw fail('DESCRIPTION_SCHEMA_CHANGED', 'Description image component has no supported URL');
      images.push(url);
      continue;
    }
    if (typeof model?.text !== 'string') throw fail('DESCRIPTION_SCHEMA_CHANGED', 'Description text component is missing');
    for (const tag of model.text.matchAll(/<img\b[^>]*>/gi)) {
      const src = tag[0].match(/\b(?:src|data-src)\s*=\s*["']([^"']+)["']/i)?.[1];
      const url = assetUrl(src?.replace(/&amp;/g, '&'));
      if (url) images.push(url);
    }
  }
  return {images, sourceComponent:[...new Set(nodes.map(node => node.key))].join(',')};
}

function pageState(itemId) {
  const text = document.body?.innerText ?? '';
  const hosts = ['item.taobao.com', 'detail.tmall.com'];
  if (hosts.includes(location.hostname) &&
      new URL(location.href).searchParams.get('id') !== itemId) return {mismatch:true};
  if (/安全验证|拖动滑块/.test(text)) return {blocked:true};
  if (/^(login|passport)([.-]|$)/.test(location.hostname)) return {login:true};
  if (!hosts.includes(location.hostname)) return null;
  const result = window.__ICE_APP_CONTEXT__?.loaderData?.home?.data?.res;
  const limited = /访问异常提示|当前访问存在异常/.test(text);
  if (!result?.item) return {limited};
  const pick = (source, names) => Object.fromEntries(names.map(name => [name, source?.[name]]));
  const videos = result.componentsVO?.headImageVO?.videos;
  return {
    limited,
    item: pick(result.item, ['itemId','title','images']),
    shop: pick(result.seller, ['shopName','shopId']),
    props: result.skuBase?.props?.map(p => ({...pick(p,['pid','name']), values:p.values?.map(v=>pick(v,['vid','name','image']))})),
    skus: result.skuBase?.skus?.map(sku=>pick(sku,['skuId','propPath'])),
    videos: Array.isArray(videos) ? videos.map(v => typeof v === 'string' ? v :
      pick(v,['url','videoUrl','videoPlayUrl','playUrl','videoThumbnailURL','coverUrl','videoCover','cover','picUrl'])) : null,
  };
}

async function withTarget(url, onEvent, action) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(fail('CDP_TIMEOUT', 'Timed out waiting for the bound CDP tab'));
    }, 5000);
    pending.set(id, {resolve, reject, timer});
    try {
      socket.send(JSON.stringify({id, method, params}));
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      reject(fail('CDP_DISCONNECTED', 'The bound CDP tab disconnected'));
    }
  });
  socket.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (!message.id) { onEvent(message, request); return; }
    const response = pending.get(message.id);
    if (!response) return;
    pending.delete(message.id);
    clearTimeout(response.timer);
    if (message.error) response.reject(fail('CDP_COMMAND_FAILED', 'The bound tab rejected a CDP command'));
    else response.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const response of pending.values()) {
      clearTimeout(response.timer);
      response.reject(fail('CDP_DISCONNECTED', 'The bound CDP tab disconnected'));
    }
    pending.clear();
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(fail('CDP_TIMEOUT', 'Unable to attach to the bound CDP tab')), 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once:true});
      socket.addEventListener('error', () => { clearTimeout(timer); reject(fail('CDP_DISCONNECTED', 'Unable to attach to the bound CDP tab')); }, {once:true});
    });
    return await action(request);
  } finally {
    socket.close();
  }
}

function matchingDescription(request, itemId) {
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || !(domain(url.hostname, 'taobao.com') || domain(url.hostname, 'tmall.com')) ||
        url.pathname !== detailPath) return false;
    const data = JSON.parse(url.searchParams.get('data') ?? new URLSearchParams(request.postData).get('data'));
    return String(data.itemId ?? data.auctionNumId ?? data.id) === itemId;
  } catch {
    return false;
  }
}

function coverage(report) {
  const skuCount = report.detail?.properties?.flatMap(property => property.values).filter(value => value.imageUrl).length ?? 0;
  const mainCount = report.detail?.mainImages.length ?? 0;
  return {
    mainImages: {status: mainCount ? 'captured' : 'unavailable', count:mainCount},
    mainVideos: {status:report.mainVideos?.status ?? 'unavailable', count:report.mainVideos?.records.length ?? 0},
    descriptionImages: {status:report.description ? 'captured' : 'unavailable', count:report.description?.images.length ?? 0},
    skuImages: {status:!report.detail?.properties ? 'unavailable' : skuCount ? 'captured' : 'absent', count:skuCount},
  };
}

async function capture(endpoint, binding, report, url) {
  const watched = new Set();
  let descriptionError;
  const event = ({method, params}, request) => {
    if (method === 'Network.requestWillBeSent') {
      watched.delete(params.requestId);
      if (matchingDescription(params.request, report.itemId)) watched.add(params.requestId);
    }
    if (method === 'Network.loadingFailed') watched.delete(params.requestId);
    if (method !== 'Network.loadingFinished' || !watched.delete(params.requestId)) return;
    if (params.encodedDataLength > 4 * 1024 * 1024) return;
    request('Network.getResponseBody', {requestId:params.requestId}).then(({body, base64Encoded}) => {
      if (body.length > 6 * 1024 * 1024) throw fail('DESCRIPTION_TOO_LARGE', 'Description response exceeds the capture limit');
      report.description ??= readDescription(base64Encoded ? Buffer.from(body,'base64').toString('utf8') : body, report.itemId);
    }).catch(error => { descriptionError = error; });
  };
  await withTarget(endpoint.httpUrl.replace('http:', 'ws:') + '/devtools/page/' + binding.targetId, event, async request => {
    await request('Page.enable');
    await request('Network.enable', {maxTotalBufferSize:8 * 1024 * 1024, maxResourceBufferSize:4 * 1024 * 1024});
    const nav = await request('Page.navigate', {url});
    if (nav.errorText) throw fail('ITEM_NAVIGATION_FAILED', 'The product page could not be opened');
    const deadline = Date.now() + 26000;
    let detailsDeadline = deadline;
    let limited = false;
    do {
      if (descriptionError?.code === 'TAOBAO_ACCESS_RESTRICTED' || descriptionError?.code === 'ITEM_ID_MISMATCH') throw descriptionError;
      const response = await request('Runtime.evaluate', {expression:'(' + pageState.toString() + ')(' + JSON.stringify(report.itemId) + ')', returnByValue:true});
      const state = response.result?.value;
      if (state?.mismatch) throw fail('ITEM_ID_MISMATCH', 'The bound tab moved to another product');
      if (state?.blocked) throw fail('TAOBAO_ACCESS_RESTRICTED', 'Taobao displays an access restriction in the selected container');
      if (state?.login) throw fail('TAOBAO_LOGIN_REQUIRED', 'Sign in manually in the selected container');
      limited = Boolean(state?.limited);
      if (state?.item && !report.detail) {
        Object.assign(report, normalizeItemMedia(state, report.itemId));
        detailsDeadline = Math.min(deadline, Date.now() + 10000);
      }
      if (limited && report.detail) break;
      if (report.detail && report.description) return;
      await pause(250);
    } while (Date.now() < detailsDeadline);
    if (descriptionError?.code === 'TAOBAO_ACCESS_RESTRICTED' || descriptionError?.code === 'ITEM_ID_MISMATCH') throw descriptionError;
    if (limited) throw fail('TAOBAO_LIMITED_PRODUCT_PAGE', 'Taobao loaded a product page with an abnormal-access notice');
    if (!report.detail) throw fail('DETAIL_STATE_UNAVAILABLE', 'The bound item page did not expose product data');
    if (descriptionError) throw fail(descriptionError.code ?? 'DESCRIPTION_RESPONSE_INVALID', 'The description response could not be read');
  });
}

async function findProductLink(endpoint, binding, {itemId, detail}) {
  const url = new URL('https://s.taobao.com/search');
  url.searchParams.set('q', detail.title.trim());
  return withTarget(endpoint.httpUrl.replace('http:', 'ws:') + '/devtools/page/' + binding.targetId, () => {}, async request => {
    const nav = await request('Page.navigate', {url:url.href});
    if (nav.errorText) throw fail('ITEM_SEARCH_NAVIGATION_FAILED', 'The Taobao search page could not be opened');
    const deadline = Date.now() + 15000;
    do {
      const response = await request('Runtime.evaluate', {expression:`(() => {
        const text = document.body?.innerText ?? '';
        if (/^(login|passport)([.-]|$)/.test(location.hostname)) return {login:true};
        if (/安全验证|拖动滑块/.test(text)) return {blocked:true};
        if (location.origin !== 'https://s.taobao.com' || location.pathname !== '/search') return {};
        return {links:Array.from(document.querySelectorAll('a[class*="doubleCardWrapper"][href]'), link => link.href)};
      })()`, returnByValue:true});
      const state = response.result?.value;
      if (state?.login) throw fail('TAOBAO_LOGIN_REQUIRED', 'Sign in manually in the selected container');
      if (state?.blocked) throw fail('TAOBAO_ACCESS_RESTRICTED', 'Taobao search requires verification in the selected container');
      const match = state?.links?.find(link => isProductUrl(link, itemId));
      if (match) return match;
      await pause(300);
    } while (Date.now() < deadline);
    throw fail('ITEM_SEARCH_MATCH_NOT_FOUND', 'The Taobao search results did not contain the exact item ID');
  });
}

const known = status => status === 'captured' || status === 'absent';

export function shouldSearch(report, explicitUrl) {
  if (explicitUrl || !report.detail?.title?.trim()) return false;
  if (report.error && !['TAOBAO_LIMITED_PRODUCT_PAGE', 'DESCRIPTION_API_FAILED',
      'DESCRIPTION_SCHEMA_CHANGED', 'DESCRIPTION_RESPONSE_INVALID'].includes(report.error.code)) return false;
  return report.error?.code === 'TAOBAO_LIMITED_PRODUCT_PAGE' || report.coverage.mainImages.count < 5 ||
    Object.values(report.coverage).some(entry => !known(entry.status));
}

export function improvesCoverage(first, candidate) {
  const categories = Object.keys(first.coverage);
  return categories.every(key => candidate.coverage[key].count >= first.coverage[key].count &&
    (!known(first.coverage[key].status) || known(candidate.coverage[key].status))) &&
    ((!candidate.error && first.error) || categories.some(key =>
      candidate.coverage[key].count > first.coverage[key].count ||
      (known(candidate.coverage[key].status) && !known(first.coverage[key].status))));
}

const mediaError = error => ({
  code:error.code ?? 'MEDIA_COLLECTION_FAILED',
  message:error.code ? error.message : 'Media collection stopped',
});

async function captureAttempt(endpoint, binding, itemId, url) {
  const report = {itemId};
  try {
    await capture(endpoint, binding, report, url);
  } catch (error) {
    report.error = mediaError(error);
  }
  report.coverage = coverage(report);
  return report;
}

async function closeCaptureTab(endpoint, targetId) {
  try {
    return await withTarget(endpoint.webSocketDebuggerUrl, () => {}, async request => {
      try {
        await request('Target.closeTarget', {targetId});
      } catch {
        // The user or site may already have closed the tab.
      }
      const deadline = Date.now() + 3000;
      do {
        const {targetInfos} = await request('Target.getTargets');
        if (!targetInfos.some(target => target.targetId === targetId)) return {status:'closed'};
        await pause(100);
      } while (Date.now() < deadline);
      throw fail('ITEM_TAB_CLOSE_FAILED', 'The capture tab is still open');
    });
  } catch (error) {
    return {status:'unconfirmed', error:mediaError(error)};
  }
}

async function collectAttempts(endpoint, binding, itemId, url, explicitUrl) {
  let selected = await captureAttempt(endpoint, binding, itemId, url);
  let source = explicitUrl ? 'explicit-url' : 'short-url';
  const attempts = [{source, coverage:selected.coverage, error:selected.error}];
  if (shouldSearch(selected, explicitUrl)) {
    const fallback = {source:'title-search'};
    attempts.push(fallback);
    try {
      const link = await findProductLink(endpoint, binding, selected);
      const candidate = await captureAttempt(endpoint, binding, itemId, link);
      Object.assign(fallback, {coverage:candidate.coverage, error:candidate.error});
      if (!candidate.error && improvesCoverage(selected, candidate)) {
        selected = candidate;
        source = fallback.source;
      }
    } catch (error) {
      fallback.error = mediaError(error);
    }
  }
  return {...selected, source, attempts};
}

export async function collectItemMedia(options) {
  validateItemMediaOptions(options);
  const url = itemUrl(options);
  const output = path.resolve(options.out);
  if (exists(output)) throw fail('OUTPUT_EXISTS', 'Use a new JSON output path');
  const connection = discover(options, {allowFixedDevCdp:true});
  if (connection.endpoint.itemMediaTargetProtocol !== 1) {
    throw fail('BROWSER_UPGRADE_REQUIRED', 'Ecom must support native container-to-CDP target binding');
  }
  const endpoint = await cdpCommand('endpoint', {profile:connection.endpoint.userDataDir});
  const listed = await readMailbox(connection);
  const container = resolveContainer(listed.containers, options.container);
  const binding = await callMailbox(connection, {method:'shops.open', service:'item-media', containerId:container.id});
  if (binding.containerId !== container.id || binding.service !== 'item-media' ||
      binding.navigation !== 'started' || binding.requestedUrl !== 'about:blank' ||
      !/^[a-f\d]{32}$/i.test(binding.targetId ?? '')) {
    throw fail('PROTOCOL_MISMATCH', 'Ecom did not return a bound capture tab', {operationId:binding.operationId, executed:'unknown'});
  }
  const itemId = options['item-id'];
  const startedAt = new Date().toISOString();
  let collected;
  let cleanup;
  try {
    collected = await collectAttempts(endpoint, binding, itemId, url, options.url);
  } finally {
    cleanup = await closeCaptureTab(endpoint, binding.targetId);
  }
  const report = {schemaVersion:1, ...collected, container, targetId:binding.targetId, cleanup,
    operationId:binding.operationId, requestedUrl:new URL(url).origin + '/item.htm?id=' + itemId, startedAt, transport:'container-cdp'};
  report.status = !report.error && Object.values(report.coverage).every(entry => known(entry.status))
    ? 'completed' : 'partial';
  report.finishedAt = new Date().toISOString();
  writeNew(output, report);
  return {ok:!report.error, status:report.status, output, container, targetId:binding.targetId,
    itemId:report.itemId, source:report.source, attempts:report.attempts, coverage:report.coverage, cleanup,
    ...(report.error ? {error:report.error} : {})};
}
