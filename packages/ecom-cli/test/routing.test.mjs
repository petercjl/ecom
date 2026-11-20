import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parse} from '../lib/cli.mjs';
import {routingPayload,routingInConnection,validateRoutingState} from '../lib/routing.mjs';
const sample=()=>({ok:true,protocolVersion:1,configuration:{enabled:true,revision:0,rules:[{id:'example-taobao-product-detail',name:'淘宝／天猫商品详情 · 示例',enabled:false,containerId:'',conditions:[],targetState:'unassigned'}]},containers:[]});
test('rule changes require a read revision; disabled drafts can remain unassigned',()=>{
  assert.equal(parse(['routing','list','--json']).command,'routing list');
  assert.equal(parse(['routing','test','--url','https://item.taobao.com/item.htm?id=1']).command,'routing test');
  const rule={name:'example',enabled:false,containerId:'',conditions:[{type:'exact',url:'https://example.org/'}]};
  assert.equal(routingPayload('save',{'rule-json':JSON.stringify(rule),'expected-revision':'0'}).rule.enabled,false);
  assert.throws(()=>routingPayload('save',{'rule-json':JSON.stringify({...rule,enabled:true}),'expected-revision':'0'}),e=>e.code==='INVALID_ARGUMENT');
  for(const action of ['save','delete','reorder','set-enabled'])assert.throws(()=>routingPayload(action,{}),e=>e.code==='INVALID_ARGUMENT');
  assert.throws(()=>routingPayload('test',{url:'https://user:password@example.org/'}),e=>e.code==='INVALID_ARGUMENT');
  assert.throws(()=>routingPayload('reorder',{'expected-revision':'0','rule-ids-json':'["a","a"]'}),e=>e.code==='INVALID_ARGUMENT');
  assert.throws(()=>parse(['routing','list','--rule-id','a']),e=>e.code==='INVALID_ARGUMENT');
});
test('routing uses authenticated native transport and rejects unknown mutation outcomes',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-routing-'));fs.chmodSync(folder,0o700);
  const endpoint={instanceId:'routing-fixture',authToken:'fixture-only',urlRoutingProtocol:1,pid:123};let mode='test',calls=0;
  fs.writeFileSync(path.join(folder,'endpoint.json'),JSON.stringify(endpoint),{mode:0o600,flag:'wx'});
  const timer=setInterval(()=>{for(const file of fs.readdirSync(folder).filter(x=>x.endsWith('.request.json'))){const req=JSON.parse(fs.readFileSync(path.join(folder,file),'utf8'));calls++;assert.equal(req.authToken,endpoint.authToken);const body=sample();if(mode==='test'){assert.equal(req.method,'routing.test');Object.assign(body,{matches:[{ruleId:'example-taobao-product-detail',enabled:false}],resolution:{matched:false},networkRequests:0})}else{body.executed=true;body.configuration.revision=mode==='good'?req.expectedRevision+1:99;}fs.writeFileSync(path.join(folder,file.replace('.request.json','.response.json')),JSON.stringify({...body,schemaVersion:1,instanceId:endpoint.instanceId,operationId:file.replace('.request.json','')}),{mode:0o600});fs.unlinkSync(path.join(folder,file));}},10);
  const connection={folder,endpoint,channel:'dev'};
  try{
    const r=await routingInConnection(connection,'test',{url:'https://item.taobao.com/item.htm?id=1'});assert.equal(r.networkRequests,0);assert.equal(r.configuration.rules[0].containerId,'');assert.equal(r.configuration.rules[0].enabled,false);
    mode='good';assert.equal((await routingInConnection(connection,'set-enabled',{enabled:'off','expected-revision':'0'})).configuration.revision,1);
    mode='bad';await assert.rejects(routingInConnection(connection,'set-enabled',{enabled:'off','expected-revision':'0'}),e=>e.code==='PROTOCOL_MISMATCH'&&e.executed==='unknown');
    const before=calls;await assert.rejects(routingInConnection({...connection,endpoint:{...endpoint,urlRoutingProtocol:0}},'list'),e=>e.code==='BROWSER_UPGRADE_REQUIRED');assert.equal(calls,before);
  }finally{clearInterval(timer);fs.rmSync(folder,{recursive:true,force:true});}
});
test('malformed routing state is not accepted as success',()=>{
  const r=sample();assert.equal(validateRoutingState(r).configuration.rules[0].targetState,'unassigned');r.configuration.rules.push({...r.configuration.rules[0]});assert.throws(()=>validateRoutingState(r),e=>e.code==='PROTOCOL_MISMATCH');
});
