import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../../browser/ecom/taobao_product_navigation.cc', import.meta.url), 'utf8');
const script = source.match(/kReadMerchantVerdict\[\] = uR"JS\(([\s\S]*?)\)JS";/)[1];
function inspect(images, text = '', elements = []) {
  const nodes = images.map(src => ({src, currentSrc: src}));
  return JSON.parse(vm.runInNewContext(script, {document: {
    body: {innerText: text}, readyState: 'complete',
    querySelector: selector => selector === '#picGalleryEle img'
      ? nodes[0] : elements.find(element => selector.split(', ').includes(element)),
    querySelectorAll: () => nodes,
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
test('denial and verification come from their platform structures', () => {
  for (const layout of ['#baxia-punish.deny .warnning-text', '#deny .deny-text']) {
    const page = inspect([], 'A localized denial message', [layout]);
    assert.equal(page.denialLayout, true);
    assert.equal(page.gallery, false);
  }
  const captcha = inspect([], '', ['#baxia-punish #nocaptcha']);
  assert.equal(captcha.denialLayout, false);
  assert.equal(captcha.verification, true);
  assert.equal(inspect([], '只允许查看本店商品详情').denialLayout, false);
});

test('thumbnail transforms collapse but underscores in distinct image names do not', () => {
  assert.equal(inspect(['https://img/a_1.jpg','https://img/a_2.jpg','https://img/a_3.jpg','https://img/a_4.jpg']).imageCount, 4);
  assert.equal(inspect(['https://img/a_1.jpg_90x90.jpg','https://img/a_1.jpg_600x600.jpg']).imageCount, 1);
});
