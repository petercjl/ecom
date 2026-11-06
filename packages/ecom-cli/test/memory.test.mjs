import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parse} from '../lib/cli.mjs';
import {validateSnapshot,readMemoryInConnection,validateTabTarget,tabMemoryActionInConnection,validateAutoOptions,validateAutomatic,autoMemoryInConnection} from '../lib/memory.mjs';
const sample=()=>({ok:true,snapshotVersion:1,snapshotId:'snapshot-fixture',metric:'macos-physical-footprint',sampledAtUnixMs:1,policy:{p0ReadOnly:true},tabs:[1,2].map(tabId=>({tabId,containerId:'shop-'+tabId,pageVersion:'doc-'+tabId,estimatedMemoryBytes:50,discardReasons:[],freezeReasons:[],connectedFreezeReasons:[]})),containers:[],processes:[{pid:123,memoryBytes:100,residentBytes:60,tabIds:[1,2]}],totals:{memoryBytes:100,residentBytes:60,attributedBytes:100,unattributedBytes:0}});
test('all memory commands are read-only snapshots and reject targeting/mutation options',()=>{
  for(const action of ['status','tabs','processes','containers'])assert.equal(parse(['memory',action,'--json','--instance','selected']).options.instance,'selected');
  for(const option of ['--yes','--container','--url'])assert.throws(()=>parse(['memory','status',option,'value']),e=>e.code==='INVALID_ARGUMENT');
  assert.throws(()=>parse(['memory','discard','--json']),e=>e.code==='INVALID_ARGUMENT');
});
test('tab actions require exact tab/container/page and expose no force override',()=>{
  const argv=['tabs','discard','--tab','123','--container','account-a','--expected-page-version','frame:1','--instance','chosen'];
  assert.deepEqual(validateTabTarget(parse(argv).options),{tabId:123,containerId:'account-a',expectedPageVersion:'frame:1'});
  assert.equal(validateTabTarget({tab:'1',container:'@default','expected-page-version':'doc'}).containerId,'');
  for(const value of ['0','-1','1.1','2147483648','abc'])assert.throws(()=>validateTabTarget({tab:value,container:'a','expected-page-version':'v'}),e=>e.code==='INVALID_ARGUMENT');
  for(const args of [['tabs','wake'],[...argv,'--force'],[...argv,'--foreground']])assert.throws(()=>parse(args),e=>e.code==='INVALID_ARGUMENT');
  assert.throws(()=>parse(['memory','operation','--operation-id','bad']),e=>e.code==='INVALID_ARGUMENT');
});
test('real mailbox tab action pins target, preserves protection codes and rejects wrong replies',{skip:process.platform==='win32'},async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-sleep-test-'));fs.chmodSync(folder,0o700);
  const endpoint={instanceId:'sleep-fixture',pid:process.pid,authToken:'fixture-only',manualTabMemoryProtocol:1};
  fs.writeFileSync(path.join(folder,'endpoint.json'),JSON.stringify(endpoint),{mode:0o600});
  const target={tabId:123,containerId:'account-a',expectedPageVersion:'doc:1'};let mode='protected',calls=0;
  const timer=setInterval(()=>{
    for(const file of fs.readdirSync(folder).filter(n=>n.endsWith('.request.json'))){
      const req=JSON.parse(fs.readFileSync(path.join(folder,file)));assert.equal(req.method,'tabs.discard');assert.equal(req.tabId,123);assert.equal(req.containerId,'account-a');assert.equal(req.expectedPageVersion,'doc:1');calls++;
      const result=mode==='protected'?{ok:false,error:{code:'TAB_PROTECTED',executed:false,diagnostics:{phase:'tab-protection',tabProtection:[{source:'discard',code:26,message:'excluded arbitrary text'}]}}}:{ok:true,action:'tabs.discard',...target,...(mode==='wrong'?{tabId:456}:{}),status:'discarded',executed:true,pageVersion:'new:0',navigationPreserved:true};
      fs.writeFileSync(path.join(folder,file.replace('.request.json','.response.json')),JSON.stringify({...result,schemaVersion:1,instanceId:endpoint.instanceId,operationId:file.replace('.request.json','')}),{mode:0o600});fs.unlinkSync(path.join(folder,file));
    }
  },10);
  const connection={folder,endpoint,channel:'dev'};
  try {
    await assert.rejects(tabMemoryActionInConnection(connection,'discard',target),e=>e.code==='TAB_PROTECTED'&&e.executed===false&&e.diagnostics.tabProtection[0].code===26&&!JSON.stringify(e.diagnostics).includes('arbitrary'));
    mode='success';assert.equal((await tabMemoryActionInConnection(connection,'discard',target)).status,'discarded');
    mode='wrong';await assert.rejects(tabMemoryActionInConnection(connection,'discard',target),e=>e.code==='PROTOCOL_MISMATCH'&&e.executed==='unknown');
    const count=calls;await assert.rejects(tabMemoryActionInConnection({...connection,endpoint:{...endpoint,manualTabMemoryProtocol:0}},'discard',target),e=>e.code==='BROWSER_UPGRADE_REQUIRED');assert.equal(calls,count);
  }finally{clearInterval(timer);fs.rmSync(folder,{recursive:true,force:true});}
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

test('automatic settings are explicit, bounded and separate from snapshot reads',()=>{
  const argv=['memory','auto','set','--enabled','on','--idle-seconds','1200','--instance','chosen'];
  assert.deepEqual(validateAutoOptions(parse(argv).options),{enabled:true,idleSeconds:1200});
  for(const idle of ['59','86401','NaN','60.5','-1'])assert.throws(()=>parse(['memory','auto','set','--enabled','on','--idle-seconds',idle]),e=>e.code==='INVALID_ARGUMENT');
  for(const args of [['memory','auto','set','--enabled','on'],['memory','auto','set','--enabled','yes','--idle-seconds','60'],['memory','auto','status','--enabled','on'],['tabs','protect','--tab','1','--container','@default','--expected-page-version','doc']])
    assert.throws(()=>parse(args),e=>e.code==='INVALID_ARGUMENT');
  assert.equal(parse(['tabs','protect','--tab','1','--container','@default','--expected-page-version','doc','--keep-awake','on']).options['keep-awake'],'on');
});
test('automatic mailbox pins settings and fails closed on mismatched readback',{skip:process.platform==='win32'},async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-auto-test-'));fs.chmodSync(folder,0o700);
  const endpoint={instanceId:'auto-fixture',pid:process.pid,authToken:'fixture-only',autoTabMemoryProtocol:1};
  fs.writeFileSync(path.join(folder,'endpoint.json'),JSON.stringify(endpoint),{mode:0o600});
  let bad=false,calls=0;
  const state={protocolVersion:1,enabled:false,idleSeconds:1200,scanIntervalSeconds:30,maxDiscardsPerScan:1,managed:false,pausedReason:'',running:false,scanCount:0,discardCount:0,recentActions:[]};
  const timer=setInterval(()=>{
    for(const file of fs.readdirSync(folder).filter(n=>n.endsWith('.request.json'))){
      const req=JSON.parse(fs.readFileSync(path.join(folder,file)));assert.equal(req.instanceId,endpoint.instanceId);calls++;
      assert.ok(['memory.auto.status','memory.auto.set'].includes(req.method));
      if(req.method==='memory.auto.set'){state.enabled=req.enabled;state.idleSeconds=req.idleSeconds;state.running=req.enabled;}
      const automatic={...state,...(bad?{idleSeconds:999}:{} )};
      fs.writeFileSync(path.join(folder,file.replace('.request.json','.response.json')),JSON.stringify({ok:true,automatic,schemaVersion:1,instanceId:endpoint.instanceId,operationId:file.replace('.request.json','')}),{mode:0o600});fs.unlinkSync(path.join(folder,file));
    }
  },10);
  const connection={folder,endpoint,channel:'dev'};
  try{
    assert.equal((await autoMemoryInConnection(connection,'status')).automatic.enabled,false);
    assert.equal((await autoMemoryInConnection(connection,'set',{enabled:true,idleSeconds:60})).automatic.idleSeconds,60);
    assert.equal((await autoMemoryInConnection(connection,'set',{enabled:false,idleSeconds:1200})).automatic.running,false);
    bad=true;await assert.rejects(autoMemoryInConnection(connection,'set',{enabled:true,idleSeconds:60}),e=>e.code==='PROTOCOL_MISMATCH'&&e.executed==='unknown');
    const n=calls;await assert.rejects(autoMemoryInConnection({...connection,endpoint:{...endpoint,autoTabMemoryProtocol:0}},'status'),e=>e.code==='BROWSER_UPGRADE_REQUIRED');assert.equal(calls,n);
    assert.throws(()=>validateAutomatic({automatic:{...state,maxDiscardsPerScan:20}}),e=>e.code==='PROTOCOL_MISMATCH');
  }finally{clearInterval(timer);fs.rmSync(folder,{recursive:true,force:true});}
});

test('native edit diagnostics distinguish leave listeners from edits and preserve unknown state',()=>{
  const d=sample();d.tabs[0].manualDiscard={eligible:true,editSignals:{available:true,hadFormInteraction:false,hadUserEdits:false,beforeUnloadDialogPossible:true,beforeUnloadBlocks:false}};
  assert.equal(validateSnapshot(d).tabs[0].manualDiscard.eligible,true);
  d.tabs[0].manualDiscard.editSignals.hadUserEdits=true;d.tabs[0].manualDiscard.eligible=false;
  assert.equal(validateSnapshot(d).tabs[0].manualDiscard.editSignals.hadUserEdits,true);
  d.tabs[0].manualDiscard.editSignals={available:false,hadFormInteraction:null,hadUserEdits:null,beforeUnloadDialogPossible:false,beforeUnloadBlocks:false};
  assert.equal(validateSnapshot(d).tabs[0].manualDiscard.editSignals.hadUserEdits,null);
  for(const mutate of [s=>s.available='yes',s=>s.hadUserEdits=false,s=>s.beforeUnloadBlocks=true,s=>s.beforeUnloadDialogPossible=null]){
    const x=structuredClone(d);mutate(x.tabs[0].manualDiscard.editSignals);assert.throws(()=>validateSnapshot(x),e=>e.code==='PROTOCOL_MISMATCH');
  }
});
