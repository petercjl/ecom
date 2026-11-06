import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parse} from '../lib/cli.mjs';
import {validateSnapshot,readMemoryInConnection} from '../lib/memory.mjs';
const sample=()=>({ok:true,snapshotVersion:1,snapshotId:'snapshot-fixture',metric:'macos-physical-footprint',sampledAtUnixMs:1,policy:{p0ReadOnly:true},tabs:[1,2].map(tabId=>({tabId,containerId:'shop-'+tabId,pageVersion:'doc-'+tabId,estimatedMemoryBytes:50,discardReasons:[],freezeReasons:[],connectedFreezeReasons:[]})),containers:[],processes:[{pid:123,memoryBytes:100,residentBytes:60,tabIds:[1,2]}],totals:{memoryBytes:100,residentBytes:60,attributedBytes:100,unattributedBytes:0}});
test('all memory commands are read-only snapshots and reject targeting/mutation options',()=>{
  for(const action of ['status','tabs','processes','containers'])assert.equal(parse(['memory',action,'--json','--instance','selected']).options.instance,'selected');
  for(const option of ['--yes','--container','--url'])assert.throws(()=>parse(['memory','status',option,'value']),e=>e.code==='INVALID_ARGUMENT');
  assert.throws(()=>parse(['memory','discard','--json']),e=>e.code==='INVALID_ARGUMENT');
});
test('shared processes reconcile once; unavailable measurements remain null',()=>{
  const s=sample();assert.equal(validateSnapshot(s).totals.memoryBytes,100);
  s.processes.push({pid:124,memoryBytes:null,residentBytes:null,tabIds:[]});
  assert.equal(validateSnapshot(s).processes[1].memoryBytes,null);
});
test('duplicate identities, unknown associations and false totals fail closed',()=>{
  for(const mutate of [s=>s.processes.push({...s.processes[0]}),s=>s.tabs.push({...s.tabs[0]}),s=>s.processes[0].tabIds.push(3),s=>s.totals.memoryBytes=200,s=>delete s.totals.attributedBytes,s=>s.processes[0].memoryBytes=-1]){
    const s=sample();mutate(s);assert.throws(()=>validateSnapshot(s),e=>e.code==='PROTOCOL_MISMATCH');
  }
});
test('real mailbox pins instance, only requests snapshot and advertises upgrade gaps',{skip:process.platform==='win32'},async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-memory-test-'));fs.chmodSync(folder,0o700);
  const endpoint={instanceId:'fixture-memory',pid:process.pid,authToken:'fixture-only',memorySnapshotProtocol:1};
  fs.writeFileSync(path.join(folder,'endpoint.json'),JSON.stringify(endpoint),{mode:0o600});
  let calls=0;
  const timer=setInterval(()=>{
    for(const file of fs.readdirSync(folder).filter(n=>n.endsWith('.request.json'))){
      const req=JSON.parse(fs.readFileSync(path.join(folder,file)));assert.equal(req.method,'memory.snapshot');assert.equal(req.instanceId,endpoint.instanceId);assert.equal(req.authToken,endpoint.authToken);calls++;
      fs.writeFileSync(path.join(folder,file.replace('.request.json','.response.json')),JSON.stringify({...sample(),schemaVersion:1,instanceId:endpoint.instanceId,operationId:file.replace('.request.json','')}),{mode:0o600});fs.unlinkSync(path.join(folder,file));
    }
  },10);
  try {
    const r=await readMemoryInConnection({folder,endpoint,channel:'dev'});assert.equal(r.instance.id,endpoint.instanceId);assert.equal(calls,1);
    await assert.rejects(readMemoryInConnection({folder,endpoint:{...endpoint,memorySnapshotProtocol:0}}),e=>e.code==='BROWSER_UPGRADE_REQUIRED');assert.equal(calls,1);
  }finally{clearInterval(timer);fs.rmSync(folder,{recursive:true,force:true});}
});
