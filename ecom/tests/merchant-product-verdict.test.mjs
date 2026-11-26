import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../../browser/ecom/taobao_product_navigation.cc', import.meta.url), 'utf8');
const script = source.match(/kReadMerchantVerdict\[\] = uR"JS\(([\s\S]*?)\)JS";/)[1];
function inspect(images, text = '', title = '商品 - 淘宝') {
  const nodes = images.map(src => ({src, currentSrc: src}));
  return JSON.parse(vm.runInNewContext(script, {document: {
    body: {innerText: text}, title, readyState: 'complete',
    querySelector: () => nodes[0], querySelectorAll: () => nodes,
  }}));
}
test('counts unique gallery pictures without fetching or counting carousel copies', () => {
  const page = inspect(['https://img/one.jpg', 'https://img/two.jpg', 'https://img/three.jpg', 'https://img/one.jpg']);
  assert.equal(page.gallery, true);
  assert.equal(page.imageCount, 3);
  assert.equal(page.settled, true);
});
test('empty gallery, ordinary gallery and verification remain distinguishable', () => {
  assert.equal(inspect([]).imageCount, 0);
  assert.equal(inspect(['1.jpg','2.jpg','3.jpg','4.jpg']).imageCount, 4);
  assert.equal(inspect(['1.jpg'], '请完成安全验证').verification, true);
});
test('explicit other-store restriction stays separate from uncertain gallery', () => {
  const page = inspect([], '基于店铺数据安全，商家账号不支持访问其他店铺商品详情', '访问被拒绝');
  assert.equal(page.otherShop, true);
  assert.equal(page.accessDeniedPage, true);
  assert.equal(page.gallery, false);
  assert.equal(inspect(['1.jpg','2.jpg','3.jpg']).otherShop, false);
});

test('thumbnail transforms collapse but underscores in distinct image names do not', () => {
  assert.equal(inspect(['https://img/a_1.jpg','https://img/a_2.jpg','https://img/a_3.jpg','https://img/a_4.jpg']).imageCount, 4);
  assert.equal(inspect(['https://img/a_1.jpg_90x90.jpg','https://img/a_1.jpg_600x600.jpg']).imageCount, 1);
});
