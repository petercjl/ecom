import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../lib/cli.mjs';
import {searchXhs,validateSearchResult} from '../lib/xhs.mjs';
const note={id:'0123456789abcdef01234567',title:'示例收纳',author:'示例作者',likes:'1.2万',url:'https://www.xiaohongshu.com/explore/0123456789abcdef01234567'};
const body=()=>({success:true,transport:'background-page-dom',keyword:'收纳',pageClosed:true,data:{state:'ready',keyword:'收纳',items:[{...note}]}});
test('search requires explicit page mode, target and bounded keyword',()=>{
 assert.equal(parse(['xhs','search','--container','Example','--keyword','收纳','--via','page']).command,'xhs search');
 for(const args of [[],['--container','a','--keyword','收纳'],['--container','a','--keyword','收纳','--via','cookie'],['--container','a','--keyword','a'.repeat(181),'--via','page']])assert.throws(()=>parse(['xhs','search',...args]),e=>e.code==='INVALID_ARGUMENT');
});
test('search validates requested keyword, unique notes, URL and response kind',()=>{
 assert.deepEqual(validateSearchResult(body(),'收纳').items,[note]);
 for(const alter of [b=>b.success=false,b=>b.keyword='other',b=>b.data.items=[],b=>b.data.items.push({...note}),b=>b.data.items[0].url+='?token=private',b=>b.transport='cookie-only',b=>b.data.items[0].likes=4]){
  const b=body();alter(b);assert.throws(()=>validateSearchResult(b,'收纳'));
 }
});
test('search pins one connection and container, projects data, and rejects unsupported runtime',async()=>{
 const c={endpoint:{instanceId:'instance-a',xhsPageSearchProtocol:1},channel:'dev'};
 const deps={discover:()=>c,inspect:async(connection,target)=>{assert.equal(connection,c);assert.equal(target,'Example');return {container:{id:'container-a',name:'Example',platform:'xiaohongshu'}};},call:async(connection,payload)=>{assert.equal(connection,c);assert.equal(payload.containerId,'container-a');assert.equal(payload.operation,'xhs.search-page');assert.match(payload.params.search_id,/^[A-Z0-9]{21}$/);return {operationId:'operation-a',containerId:'container-a',businessOperation:'xhs.search-page',data:body()};}};
 const result=await searchXhs({container:'Example',keyword:'收纳',via:'page'},deps);
 assert.equal(result.count,1);assert.equal(result.instance.id,'instance-a');assert.equal(result.pageClosed,true);
 await assert.rejects(searchXhs({container:'Example',keyword:'收纳',via:'page'},{...deps,discover:()=>({endpoint:{}})}),e=>e.code==='BROWSER_UPGRADE_REQUIRED');
 await assert.rejects(searchXhs({container:'Example',keyword:'收纳',via:'page'},{...deps,inspect:async()=>({container:{platform:'custom'}})}),e=>e.code==='XHS_CONTAINER_REQUIRED');
 await assert.rejects(searchXhs({container:'Example',keyword:'收纳',via:'page'},{...deps,call:async()=>({containerId:'other'})}),e=>e.code==='PROTOCOL_MISMATCH');
});
