import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectInConnection,requestInConnection,registeredReadInConnection,validateReadUrl,resolveContainer} from '../lib/browser.mjs';
import {parse} from '../lib/cli.mjs';
const origin='https://example.com';
const accounts=[{id:'account-a',name:'示例甲'},{id:'account-b',name:'示例乙'}];
function fixture(handler) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-session-test-'));fs.chmodSync(folder,0o700);
  const endpoint={instanceId:'fixture-instance',pid:process.pid,authToken:'fixture-only',allowedOrigin:origin};
  fs.writeFileSync(path.join(folder,'endpoint.json'),JSON.stringify(endpoint),{mode:0o600});
  const calls=[];
  const timer=setInterval(()=>{
    for(const file of fs.readdirSync(folder).filter(n=>n.endsWith('.request.json'))) {
      const message=JSON.parse(fs.readFileSync(path.join(folder,file),'utf8'));
      assert.equal(message.authToken,endpoint.authToken);
      assert.equal(message.instanceId,endpoint.instanceId);
      calls.push({method:message.method,containerId:message.containerId,url:message.url});
      const body=handler(message,{folder,endpoint});
      fs.writeFileSync(path.join(folder,file.replace('.request.json','.response.json')),JSON.stringify({schemaVersion:1,instanceId:endpoint.instanceId,operationId:file.replace('.request.json',''),...body}),{mode:0o600});
      fs.unlinkSync(path.join(folder,file));
    }
  },5);
  return {connection:{folder,endpoint,channel:'dev'},calls,close(){clearInterval(timer);fs.rmSync(folder,{recursive:true});}};
}
test('inspect/request parser rejects unsupported or incomplete inputs before discovery',()=>{
  assert.equal(parse(['containers','inspect','--container','示例甲']).options.container,'示例甲');
  assert.equal(parse(['session','request','--container','account-a','--url',origin+'/data','--method','GET']).options.method,'GET');
  for(const args of [['containers','inspect'],['session','request','--container','account-a'],['session','request','--container','a','--url',origin,'--body','x'],['containers','inspect','--container','a','--container','b']])assert.throws(()=>parse(args));
  for(const url of ['http://example.com/data','https://user:pass@example.com/','file:///tmp/data',origin+'/#fragment'])assert.throws(()=>validateReadUrl(url));
  for(const key of ['token','Cookie','_csrf','api_key','accessKey','password'])assert.throws(()=>validateReadUrl(origin+'/?'+key+'=private'),e=>e.code==='CREDENTIAL_INPUT_REJECTED');
  assert.throws(()=>validateReadUrl(origin,'POST'),e=>e.code==='METHOD_UNSUPPORTED');
  assert.throws(()=>resolveContainer([{id:'a',name:'same'},{id:'b',name:'same'}],'same'),e=>e.code==='CONTAINER_AMBIGUOUS');
  assert.throws(()=>resolveContainer(accounts,'missing'),e=>e.code==='CONTAINER_NOT_FOUND');
});
test('inspect exposes selected metadata and separates stored binding from current verification',{skip:process.platform==='win32'},async()=>{
  const f=fixture(()=>({ok:true,shops:[{...accounts[0],platform:'taobao',homeUrl:origin+'/?token=private',icon:2,color:'#123456',state:'login-required',identity:{shopId:'sample-shop'},authentication:{service:'sycm',state:'signed-out',secret:'excluded'},verificationSupported:true,checkedAt:'123',expiry:{kind:'session',cookieExpiresAt:'456',cookie:'excluded'},diagnostics:{cookie:'excluded'}}]}));
  try {
    const result=await inspectInConnection(f.connection,'示例甲');
    assert.equal(result.container.id,'account-a');assert.equal(result.container.login.identityBound,true);assert.equal(result.container.login.identityConfirmed,false);
    assert.equal(result.container.login.authenticationState,'signed-out');
    const text=JSON.stringify(result);assert.ok(!text.includes('private'));assert.ok(!text.includes('excluded'));
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'shops.list');
  }finally{f.close();}
});
test('concurrent session requests pin the original instance and separate account IDs',{skip:process.platform==='win32'},async()=>{
  const f=fixture(message=>message.method==='containers.list'?{ok:true,containers:accounts}:{ok:true,containerId:message.containerId,httpStatus:200,data:{account:message.containerId,value:message.containerId==='account-a'?11:22}});
  try {
    const [a,b]=await Promise.all(accounts.map(account=>requestInConnection(f.connection,{container:account.name,url:origin+'/data'})));
    assert.equal(a.data.account,'account-a');assert.equal(b.data.account,'account-b');
    assert.equal(a.instance.id,b.instance.id);assert.notEqual(a.operationId,b.operationId);
    assert.equal(a.businessStatus,'not-evaluated');assert.equal(b.httpStatus,200);
    assert.ok(f.calls.every(c=>['containers.list','session.get'].includes(c.method)));
    const count=f.calls.length;
    await assert.rejects(requestInConnection(f.connection,{container:'account-a',url:'https://other.example/data'}),e=>e.code==='ORIGIN_NOT_ALLOWED');
    assert.equal(f.calls.length,count);
  }finally{f.close();}
});
test('native readiness/errors survive the CLI boundary and wrong-account replies are rejected',{skip:process.platform==='win32'},async()=>{
  let wrongAccount=false;
  const f=fixture(message=>message.method==='containers.list'?{ok:true,containers:accounts}:wrongAccount?{ok:true,containerId:'account-b',httpStatus:200,data:{}}:{ok:false,error:{code:'SHOP_NOT_READY',executed:false,httpStatus:0}});
  try {
    await assert.rejects(requestInConnection(f.connection,{container:'account-a',url:origin+'/data'}),e=>e.code==='SHOP_NOT_READY'&&e.executed===false&&e.httpStatus===0&&!!e.operationId);
    wrongAccount=true;
    await assert.rejects(requestInConnection(f.connection,{container:'account-a',url:origin+'/data'}),e=>e.code==='PROTOCOL_MISMATCH'&&e.executed==='unknown');
  }finally{f.close();}
});
test('restart between container selection and submission refuses without a session request',{skip:process.platform==='win32'},async()=>{
  const f=fixture((message,{folder,endpoint})=>{
    fs.writeFileSync(path.join(folder,'endpoint.json'),JSON.stringify({...endpoint,instanceId:'replacement'}),{mode:0o600});
    return {ok:true,containers:accounts};
  });
  try {
    await assert.rejects(requestInConnection(f.connection,{container:'account-a',url:origin+'/data'}),e=>e.code==='INSTANCE_CHANGED');
    assert.equal(f.calls.length,1);
  }finally{f.close();}
});

test('registered reads require a matching browser catalog and freeze account and operation',{skip:process.platform==='win32'},async()=>{
  const hash='a'.repeat(64);let mismatch=false;
  const f=fixture(message=>message.method==='containers.list'?{ok:true,containers:accounts}:{ok:true,containerId:message.containerId,businessOperation:mismatch?'other-operation':message.operation,httpStatus:200,data:{code:0,data:{value:11}}});
  try {
    await assert.rejects(registeredReadInConnection(f.connection,{container:'account-a'},'alimama.report',{},hash),e=>e.code==='BROWSER_UPGRADE_REQUIRED');
    Object.assign(f.connection.endpoint,{businessReadProtocol:1,businessReadRegistryHash:hash});
    fs.writeFileSync(path.join(f.connection.folder,'endpoint.json'),JSON.stringify(f.connection.endpoint),{mode:0o600});
    await assert.rejects(registeredReadInConnection(f.connection,{container:'account-a'},'alimama.report',{},'b'.repeat(64)),e=>e.code==='BROWSER_UPGRADE_REQUIRED');
    assert.equal(f.calls.length,0);
    const result=await registeredReadInConnection(f.connection,{container:'示例甲'},'alimama.report',{page:1},hash);
    assert.equal(result.container.id,'account-a');assert.equal(result.operation,'alimama.report');assert.equal(result.transport,'native-business-read');
    assert.equal(f.calls[1].method,'business.read');
    mismatch=true;
    await assert.rejects(registeredReadInConnection(f.connection,{container:'account-a'},'alimama.report',{},hash),e=>e.code==='PROTOCOL_MISMATCH'&&e.executed==='unknown');
  }finally{f.close();}
});
