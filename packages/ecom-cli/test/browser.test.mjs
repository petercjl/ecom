import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readMailbox} from '../lib/browser.mjs';
test('authenticated mailbox read never navigates and filters response fields',{skip:process.platform==='win32'},async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-mailbox-'));fs.chmodSync(folder,0o700);
  const endpoint={instanceId:'test-instance',pid:process.pid,authToken:'test-only-not-a-secret'};
  fs.writeFileSync(path.join(folder,'endpoint.json'),JSON.stringify(endpoint),{mode:0o600});
  const timer=setInterval(()=>{
    const request=fs.readdirSync(folder).find(n=>n.endsWith('.request.json'));if(!request)return;
    const body=JSON.parse(fs.readFileSync(path.join(folder,request),'utf8'));
    assert.equal(body.method,'containers.list');assert.equal(body.authToken,endpoint.authToken);
    const operationId=request.replace('.request.json','');
    fs.writeFileSync(path.join(folder,operationId+'.response.json'),JSON.stringify({ok:true,schemaVersion:1,instanceId:endpoint.instanceId,operationId,containers:[{id:'sample-id',name:'示例账号',extra:'excluded'}]}),{mode:0o600});
    fs.unlinkSync(path.join(folder,request));
  },10);
  try{const r=await readMailbox({folder,endpoint,channel:'dev'},2000);assert.deepEqual(r.containers,[{id:'sample-id',name:'示例账号'}]);}
  finally{clearInterval(timer);fs.rmSync(folder,{recursive:true});}
});
test('unsafe permissions and unknown outcomes are explicit',{skip:process.platform==='win32'},async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-mailbox-'));fs.chmodSync(folder,0o700);
  const endpoint={instanceId:'test',pid:process.pid,authToken:'fixture'};
  const file=path.join(folder,'endpoint.json');fs.writeFileSync(file,JSON.stringify(endpoint),{mode:0o644});
  try{
    await assert.rejects(readMailbox({folder,endpoint}),e=>e.code==='UNSAFE_ENDPOINT');
    fs.chmodSync(file,0o600);
    await assert.rejects(readMailbox({folder,endpoint},30),e=>e.code==='OPERATION_TIMEOUT'&&e.executed==='unknown'&&!!e.operationId);
  }finally{fs.rmSync(folder,{recursive:true});}
});
