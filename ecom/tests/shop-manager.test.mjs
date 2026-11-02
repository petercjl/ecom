import test from 'node:test';
import assert from 'node:assert/strict';
import {filterShops, shopRequest, appearanceRequest, deletionRequest} from '../../browser/ecom/shop_manager/model.js';

const rows = [
  {id:'shop-a', name:'旗舰店', platform:'taobao', state:'ready', identity:{shopId:'123', accountId:'456', platformName:'平台店名'}},
  {id:'shop-b', name:'同名店', platform:'taobao', state:'verification-required'},
  {id:'general', name:'买家', state:'unconfigured'},
];
test('shop manager composes platform, state and identity search without changing sessions',()=>{
  assert.deepEqual(filterShops(rows,{scope:'taobao',state:'ready',query:'平台店名'}).map(row=>row.id),['shop-a']);
  assert.deepEqual(filterShops(rows,{state:'pending'}).map(row=>row.id),['shop-b']);
  assert.deepEqual(filterShops(rows,{scope:'general'}).map(row=>row.id),['general']);
  assert.deepEqual(filterShops(rows,{query:' 456 '}).map(row=>row.id),['shop-a']);
  assert.equal(rows[0].state,'ready');
});
test('all shop service choices keep the same stable native container ID',()=>{
  for (const service of ['sycm','qianniu','alimama']) {
    assert.deepEqual(shopRequest('open',rows[0],service),{method:'shops.open',containerId:'shop-a',service});
  }
  assert.throws(()=>shopRequest('open',rows[0],'external'),/SERVICE_UNSUPPORTED/);
  assert.throws(()=>shopRequest('open',{name:'ambiguous'},'sycm'),/CONTAINER_REQUIRED/);
});
test('identity confirmation uses the current verified candidate, never the display name',()=>{
  assert.throws(()=>shopRequest('confirm',rows[0]),/STALE_IDENTITY_CANDIDATE/);
  const pending={...rows[1],state:'awaiting-confirmation',candidate:{shopId:'789',candidateId:'nonce'}};
  assert.deepEqual(shopRequest('confirm',pending),{method:'shops.confirm',containerId:'shop-b',shopId:'789',candidateId:'nonce'});
});
test('appearance changes preserve the native ID and validate icon and color',()=>{
  assert.deepEqual(appearanceRequest('shop-a',' New name ',2,'#123abc'),{method:'shops.update',containerId:'shop-a',name:'New name',icon:2,color:'#123abc'});
  for(const [icon,color] of [[11,'#123abc'],[-1,'#123abc'],[2,'red'],[2,'#123abc00']]) assert.throws(()=>appearanceRequest('shop-a','Name',icon,color),/INVALID_CONTAINER_APPEARANCE/);
});
test('deletion requires a reviewed target and no open container tabs',()=>{
  assert.throws(()=>deletionRequest({containerId:'shop-a'}),/DELETE_CONFIRMATION_REQUIRED/);
  assert.throws(()=>deletionRequest({containerId:'shop-a',confirmationId:'nonce',openTabs:1}),/CONTAINER_IN_USE/);
  assert.deepEqual(deletionRequest({containerId:'shop-a',confirmationId:'nonce',openTabs:0}),{method:'shops.delete',containerId:'shop-a',confirmationId:'nonce'});
});
