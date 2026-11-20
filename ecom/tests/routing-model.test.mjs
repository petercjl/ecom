import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePastedRoutingUrls} from '../../browser/ecom/shop_manager/routing-model.js';
const blank=()=>({type:'pattern',scheme:'https',host:'',path:'/*',includeSubdomains:false,query:[]});
test('pasting exact URLs replaces the untouched placeholder and preserves other draft conditions',()=>{
  const existing=[blank(),{type:'pattern',scheme:'http+https',host:'example.org',path:'/product/*',includeSubdomains:false,query:[]}];
  const result=mergePastedRoutingUrls(existing,'https://item.taobao.com/item.htm?id=1\r\n\nhttps://detail.tmall.com/item.htm?id=2');
  assert.equal(result.length,3);assert.equal(result[0].host,'example.org');assert.equal(result[1].type,'exact');assert.equal(existing.length,2);assert.equal(existing[0].host,'');
  const partial={...blank(),path:'/unfinished'};assert.deepEqual(mergePastedRoutingUrls([partial],'https://example.org/')[0],partial);
});
test('empty paste and failed validation preserve the original form draft',()=>{
  const existing=[blank()];assert.equal(mergePastedRoutingUrls(existing,'\n '),existing);
  for(const text of ['javascript:alert(1)','https://user:password@example.org/','not a URL'])assert.throws(()=>mergePastedRoutingUrls(existing,text),/INVALID_ROUTING_URL/);
  assert.equal(existing.length,1);assert.throws(()=>mergePastedRoutingUrls([],Array(51).fill('https://example.org/').join('\n')),/ROUTING_CONDITION_LIMIT/);
});
