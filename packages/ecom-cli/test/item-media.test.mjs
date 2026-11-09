import assert from 'node:assert/strict';
import test from 'node:test';
import {parse} from '../lib/cli.mjs';
import {improvesCoverage, isProductUrl, normalizeItemMedia, readDescription, selectSearchProductLink, shouldSearch} from '../lib/item-media.mjs';

const itemId = '100000000001';
const image = n => 'https://img.alicdn.com/' + n + '.jpg';

test('title search accepts exact Taobao redirect cards and prefers a direct product link', () => {
  const redirect = 'https://mclick.simba.taobao.com/cc_im?id=' + itemId + '&spm=sample';
  const direct = 'https://item.taobao.com/item.htm?id=' + itemId;
  assert.equal(selectSearchProductLink([redirect.replace(itemId, '2'), redirect], itemId), redirect);
  assert.equal(selectSearchProductLink([redirect, direct], itemId), direct);
  assert.equal(selectSearchProductLink([redirect.replace('mclick.simba.taobao.com', 'other.example'),
    redirect.replace('/cc_im', '/other'), redirect + '&id=2'], itemId), undefined);
  assert.equal(isProductUrl(redirect, itemId), false);
});

test('item media searches incomplete short-link results and only accepts exact product URLs', () => {
  const first = {detail:{title:'Sample product'}, coverage:{mainImages:{status:'captured', count:3}}};
  const full = {...first, coverage:{mainImages:{status:'captured', count:5}}};
  assert.equal(shouldSearch(first), true);
  assert.equal(shouldSearch(full), false);
  assert.equal(shouldSearch(first, 'explicit'), false);
  assert.equal(shouldSearch({...first, error:{code:'TAOBAO_ACCESS_RESTRICTED'}}), false);
  assert.equal(improvesCoverage(first, full), true);
  assert.equal(improvesCoverage(full, first), false);
  const url = 'https://detail.tmall.com/item.htm?id=' + itemId;
  assert.equal(isProductUrl(url + '&spm=sample', itemId), true);
  assert.equal(isProductUrl(url + '&id=other', itemId), false);
  assert.equal(isProductUrl(url, '2'), false);
  assert.equal(isProductUrl(url.replace('detail.tmall.com', 'other.example'), itemId), false);
});

test('item media keeps image and video order and maps SKU images to their options', () => {
  const state = {
    item:{itemId, images:[image(3), image(1), image(2)]},
    props:[{pid:1, values:[{vid:4, image:image(4)}, {vid:5, image:image(5)}]}],
    skus:[{skuId:10, propPath:'1:5'}],
    videos:[{url:'http://cloud.video.taobao.com/play/a.mp4?quality=hd', videoThumbnailURL:image(6)},
      {coverUrl:image(7)}, {videoUrl:'https://video.alicdn.com/b.mp4'}],
  };
  const report = normalizeItemMedia(state, itemId);
  assert.deepEqual(report.detail.mainImages, [image(3), image(1), image(2)]);
  assert.deepEqual(report.detail.properties[0].values.map(x=>x.imageUrl), [image(4), image(5)]);
  assert.deepEqual(report.detail.skus[0].imageUrls, [image(5)]);
  assert.equal(report.mainVideos.status, 'partial');
  assert.deepEqual(report.mainVideos.records.map(x=>x.sourceIndex), [0,2]);
  assert.equal(report.mainVideos.records[0].url, 'https://cloud.video.taobao.com/play/a.mp4?quality=hd');
  assert.equal(report.mainVideos.records[0].posterUrl, image(6));
  assert.equal(normalizeItemMedia({...state, videos:[]}, itemId).mainVideos.status, 'absent');
  assert.equal(normalizeItemMedia({...state, videos:null}, itemId).mainVideos.status, 'unavailable');
  assert.throws(() => normalizeItemMedia(state, '2'), {code:'ITEM_ID_MISMATCH'});
});

test('description collection follows layout and stops on platform restrictions', () => {
  const payload = {ret:['SUCCESS::OK'], data:{components:{
    layout:[{ID:'second',key:'desc_single_image'}, {ID:'first',key:'desc_richtext'}, {ID:'detail_pic_tmallPriceDesc_1',key:'desc_single_image'}],
    componentData:{
      first:{model:{itemId,text:'<img src="' + image(1) + '"><img data-src="' + image(3) + '">'}},
      second:{model:{itemId,picUrl:image(2)}},
    },
  }}};
  assert.deepEqual(readDescription('callback(' + JSON.stringify(payload) + ')', itemId).images,
    [image(2),image(1),image(3)]);
  assert.throws(() => readDescription(JSON.stringify(payload), '2'), {code:'ITEM_ID_MISMATCH'});
  assert.throws(() => readDescription('{"ret":["FAIL_SYS_USER_VALIDATE"]}', itemId), {code:'TAOBAO_ACCESS_RESTRICTED'});
});

test('item media requires an exact container selector, digits and a JSON output path', () => {
  const argv = ['item','media','--container','Buyer','--item-id',itemId,'--out','media.json'];
  assert.equal(parse(argv).command,'item media');
  assert.throws(() => parse(argv.slice(0,-2)), {code:'INVALID_ARGUMENT'});
});
