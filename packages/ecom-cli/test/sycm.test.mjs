import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {inventory,buildRead,runRead,businessResponse,paramsObject,planMutation,authorizePlan,showPlan,nativeRegistryHash,resolveModuleResponse} from '../lib/data/taobao/sycm.mjs';
import {parse,main} from '../lib/cli.mjs';
import {root,fail} from '../lib/common.mjs';
import {newerStableVersion} from '../lib/maintenance.mjs';

test('complete source registry is physically bundled with license and checksum provenance',()=>{
  const dir=path.join(root,'lib/sycm-vendor'),meta=JSON.parse(fs.readFileSync(path.join(dir,'provenance.json')));
  for(const [name,hash]of Object.entries(meta.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex'),hash);
  const result=inventory();assert.equal(result.operations.length,137);assert.equal(result.businessCapabilities.length,37);assert.equal(result.mutations.length,7);
  assert.equal(result.operations.filter(x=>!x.browserOperation&&x.legacyTransport==='native-session-get').length,88);
  assert.equal(result.operations.filter(x=>x.transport==='native-business-read').length,137);
  for(const item of result.operations){assert.equal(item.runtimeVerified,false);assert.ok(item.requiredParams);assert.equal(item.sideEffect,'none');}
  for(const item of result.mutations)assert.equal(item.automaticSubmission,false);
});
test('all registered native reads preserve endpoint, defaults and required inputs; unsupported services fail before discovery',()=>{
  for(const op of inventory().operations.filter(operation=>!operation.browserOperation&&!operation.signedDevRoute)){
    const params=Object.fromEntries(op.requiredParams.map(k=>[k,/Time$/.test(k)?'2026-11-01':'sample']));
    if(op.legacyTransport==='native-session-get') {
      const built=buildRead(op.id,params),url=new URL(built.url);assert.equal(url.origin,op.origin);assert.equal(url.pathname,op.path);
      for(const key of op.requiredParams)assert.equal(url.searchParams.get(key),'sample');
      if(op.requiredParams.length)assert.throws(()=>buildRead(op.id,{}));
    }else assert.throws(()=>buildRead(op.id,params),e=>e.code==='SERVICE_ADAPTER_REQUIRED');
  }
  assert.throws(()=>buildRead('unregistered',{}));
  for(const value of ['{"__tk":"private"}','{"loginPointId":"private"}','{"token":"private"}','{"x":{"Cookie":"private"}}','{"x":"https://example.com/?token=private"}','{"__proto__":{"x":1}}','[]'])assert.throws(()=>paramsObject(value));
});
test('real CLI parser exposes strict business commands and missing targets fail early',async()=>{
  assert.equal(parse(['sycm','run','--operation','shop.trade-summary','--container','example','--params-json','{}']).command,'sycm run');
  for(const args of [['sycm','run'],['sycm','run','--operation','shop.trade-summary'],['sycm','mutation','apply','--plan','x','--container','a'],['sycm','schema'],['sycm','open'],['sycm','open','--operation','alimama.access']])assert.throws(()=>parse(args));
  assert.equal(parse(['sycm','open','--operation','alimama.access','--container','example','--foreground']).options.foreground,true);
  assert.equal(parse(['sycm','run','--operation','shop.trade-daily','--container','example','--recover-login']).options['recover-login'],true);
  assert.throws(()=>parse(['sycm','open','--operation','shop.trade-daily','--container','example','--recover-login']),{code:'INVALID_ARGUMENT'});
  const result=await main(['sycm','operations','--json']);assert.equal(result.count,137);
});
test('business errors and credential fields do not become false successes or leak diagnostics',async()=>{
  for(const body of [{content:{code:5810,data:null,message:'请登录'}},{hasError:true,content:{data:null}}, {code:5810,message:'请登录 https://example.com/?token=private'},{success:false,info:{message:'无权限'}},{code:1,message:'滑块验证'}])assert.throws(()=>businessResponse(body),e=>e.executed===true&&!e.message.includes('private'));
  assert.throws(()=>businessResponse({}),e=>e.code==='BUSINESS_RESPONSE_INVALID');
  assert.equal(businessResponse({content:{code:0,data:{category:3}},hasError:false}).content.data.category,3);
  const clean=businessResponse({code:0,data:{secret:'private',loginPointId:'private',__tk:'private',value:3,url:'https://example.com/?token=private'}});assert.ok(!JSON.stringify(clean).includes('private'));assert.equal(clean.data.value,3);
  const connection={endpoint:{instanceId:'same'}},deps={discover:()=>connection,request:async(c,o)=>{assert.equal(c,connection);assert.equal(o.container,'account-a');return {operationId:'operation-a',instance:{id:'same'},container:{id:'account-a'},data:{code:5810,message:'登录'}};}};
  await assert.rejects(runRead({operation:'shop.trade-summary',container:'account-a','params-json':'{"dateRange":"2026-11-01|2026-11-01"}'},deps),e=>e.code==='AUTH_REQUIRED'&&e.operationId==='operation-a');
});
test('failed SYCM bootstrap uses fresh signed-out evidence to return pinned login recovery',async()=>{
  const options={operation:'shop.trade-daily',container:'Fixture store','params-json':'{"date":"2026-11-26"}'};
  const connection={endpoint:{instanceId:'dev-instance',businessReadProtocol:1}};
  const failure=fail('REQUEST_FAILED','Native request failed',{operationId:'read-op',executed:false,targetContainerId:'shop-id',
    diagnostics:{phase:'auth-sycm-home',netError:-2,bodyKind:'none'}});
  const checkedAt=String(Math.floor(Date.now()/1000)-10);
  const signedOut={service:'sycm',authenticationState:'signed-out',checkedAt};
  const deps={discover:()=>connection,registeredRequest:async()=>{throw failure;}};
  const inspect=login=>async (pinned,selector)=>{
    assert.equal(pinned,connection);
    assert.equal(selector,'shop-id');
    return {instance:{id:'dev-instance'},container:{id:'shop-id',name:'Fixture store',login}};
  };
  await assert.rejects(runRead(options,{...deps,inspect:inspect(signedOut)}),error=>{
    assert.equal(error.code,'AUTH_REQUIRED');
    assert.equal(error.executed,false);
    assert.equal(error.operationId,'read-op');
    assert.equal(error.diagnostics.netError,-2);
    assert.equal(error.recovery.containerId,'shop-id');
    assert.deepEqual(error.recovery.options,{'--container':'Fixture store','--instance':'dev-instance','--json':true});
    assert.equal(error.recovery.command,'shops open-login');
    return true;
  });
  for(const login of [
    {...signedOut,authenticationState:'authenticated'},
    {...signedOut,checkedAt:'1'},
    {...signedOut,service:'alimama'},
  ]) await assert.rejects(runRead(options,{...deps,inspect:inspect(login)}),error=>error===failure);
  await assert.rejects(runRead(options,{...deps,inspect:async()=>{throw new Error('Inspection failed');}}),error=>error===failure);
});

test('authorized SYCM reads check session first and recover once on the pinned account',async()=>{
  const opts={operation:'shop.trade-daily',container:'Fixture store','recover-login':true,'params-json':'{"date":"2026-11-26"}'};
  const connection={endpoint:{instanceId:'fixture-instance',businessReadProtocol:1}};
  const instance={id:'fixture-instance'};
  const checkedAt=String(Math.floor(Date.now()/1000));
  const bootstrapError=fail('REQUEST_FAILED','Bootstrap failed',{executed:false,diagnostics:{phase:'auth-sycm-home',netError:-2}});
  const forbidden=fail('AUTH_OR_RISK_CHALLENGE','Site rejected the request',{executed:false});
  const fixture=({state,firstError,repeatError,status='backend-page',loginInstance=instance}={})=>{
    const calls=[];
    const container={id:'fixture-shop',name:'Fixture store',platform:'taobao',login:{service:'sycm',authenticationState:state,checkedAt}};
    const deps={
      discover:()=>connection,
      inspect:async(current,selector)=>{
        assert.equal(current,connection);
        assert.equal(selector,container.name);
        calls.push('inspect');
        return {container,instance};
      },
      registeredRequest:async(current,options,id,params)=>{
        assert.equal(current,connection);
        assert.equal(options.container,container.id);
        assert.equal(id,'shop.trade-summary');
        assert.equal(params.dateRange,'2026-11-26|2026-11-26');
        calls.push('read');
        if(firstError){const error=firstError;firstError=null;throw error;}
        if(repeatError)throw repeatError;
        return {container,instance,data:{code:0,data:{}}};
      },
      signIn:async options=>{
        assert.deepEqual(options,{container:container.name,instance:instance.id});
        calls.push('login');
        return {operationId:'desktop-op',instance:loginInstance,container,status,loginClick:'delivered'};
      },
    };
    return {calls,run:()=>runRead(opts,deps)};
  };
  const authenticated=fixture({state:'authenticated'});
  assert.equal((await authenticated.run()).loginRecovery,undefined);
  assert.deepEqual(authenticated.calls,['inspect','read']);
  const signedOut=fixture({state:'signed-out'});
  assert.equal((await signedOut.run()).loginRecovery.operationId,'desktop-op');
  assert.deepEqual(signedOut.calls,['inspect','login','read']);
  const unknown=fixture({state:'unknown',firstError:bootstrapError});
  assert.equal((await unknown.run()).businessStatus,'success');
  assert.deepEqual(unknown.calls,['inspect','read','login','read']);
  const risk=fixture({state:'signed-out',status:'verification-required'});
  await assert.rejects(risk.run(),{code:'RISK_VERIFICATION_REQUIRED',executed:false,operationId:'desktop-op'});
  assert.deepEqual(risk.calls,['inspect','login']);
  const retryError=fail('AUTH_CONTEXT_REQUIRED','Service context unresolved',{executed:false});
  const failed=fixture({state:'unknown',firstError:bootstrapError,repeatError:retryError});
  await assert.rejects(failed.run(),error=>error===retryError&&error.diagnostics.login.operationId==='desktop-op');
  assert.deepEqual(failed.calls,['inspect','read','login','read']);
  const denied=fixture({state:'unknown',firstError:forbidden});
  await assert.rejects(denied.run(),error=>error===forbidden);
  assert.deepEqual(denied.calls,['inspect','read']);
  const mismatch=fixture({state:'signed-out',loginInstance:{id:'other'}});
  await assert.rejects(mismatch.run(),{code:'PROTOCOL_MISMATCH'});
  assert.deepEqual(mismatch.calls,['inspect','login']);
});

test('mutation plans are private, require identity, reject wrong confirmation/account, authorize once and never submit',{skip:process.platform==='win32'},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-sycm-plan-')),old=process.env.ECOM_CLI_STATE_DIR;process.env.ECOM_CLI_STATE_DIR=dir;
  const target={id:'account-a',name:'Example account',identity:{shopId:'sample-shop',accountId:'sample-user'}};
  const deps={discover:()=>({endpoint:{instanceId:'sample-instance'}}),account:async()=>target};
  try {
    const planned=await planMutation({operation:'qianniu-product-batch-draft',container:target.id,'params-json':'{"products":[{"title":"Sample"}]}'},deps);
    const {planId,confirmationCode}=planned.plan;assert.equal(planned.executed,false);assert.equal(planned.automaticSubmission,false);
    const file=path.join(dir,'sycm-plans',planId+'.json');assert.equal(fs.statSync(file).mode&0o777,0o600);
    const shown=showPlan(planId);assert.equal(shown.plan.status,'planned');assert.equal(shown.plan.payload,undefined);assert.equal(shown.plan.confirmationDigest,undefined);
    const options={plan:planId,container:target.id,confirm:confirmationCode};
    await assert.rejects(authorizePlan({...options,confirm:'wrong'},deps),e=>e.code==='CONFIRMATION_FAILED');
    await assert.rejects(authorizePlan(options,{...deps,account:async()=>({...target,id:'account-b'})}),e=>e.code==='STORE_IDENTITY_MISMATCH');
    const applied=await authorizePlan(options,deps);assert.equal(applied.executed,false);assert.equal(applied.workflow.readbackRequired,true);assert.equal(applied.status,'authorized');
    assert.equal(showPlan(planId).plan.status,'authorized');await assert.rejects(authorizePlan(options,deps),e=>e.code==='PLAN_ALREADY_USED');
  }finally{if(old===undefined)delete process.env.ECOM_CLI_STATE_DIR;else process.env.ECOM_CLI_STATE_DIR=old;fs.rmSync(dir,{recursive:true});}
});

test('mutation plans cover every workflow and refuse expiry, tampering and concurrent duplicate authorization',{skip:process.platform==='win32'},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-sycm-negative-')),old=process.env.ECOM_CLI_STATE_DIR;process.env.ECOM_CLI_STATE_DIR=dir;
  const deps={discover:()=>({endpoint:{instanceId:'sample-instance'}}),account:async()=>({id:'sample-account',name:'Sample',identity:{shopId:'s',accountId:'a'}})};
  try {
    for(const cap of inventory().mutations){
      const payload=Object.fromEntries(cap.requiredFields.map(key=>[key,[]]));
      const result=await planMutation({operation:cap.id,container:'sample-account','params-json':JSON.stringify(payload)},deps);
      assert.equal(result.executed,false);assert.ok(result.plan.idempotencyKey);
      const opts={plan:result.plan.planId,container:'sample-account',confirm:result.plan.confirmationCode};
      const outcomes=await Promise.allSettled([authorizePlan(opts,deps),authorizePlan(opts,deps)]);
      assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'PLAN_ALREADY_USED');
    }
    for(const type of ['expired','tampered']) {
      const {plan}=await planMutation({operation:'qianniu-product-batch-draft',container:'sample-account','params-json':'{"products":[]}'},deps);
      const file=path.join(dir,'sycm-plans',plan.planId+'.json'),saved=JSON.parse(fs.readFileSync(file));
      if(type==='expired')saved.expiresAt='2000-01-01T00:00:00Z';else saved.payload.products.push({title:'changed'});
      fs.writeFileSync(file,JSON.stringify(saved));
      await assert.rejects(authorizePlan({plan:plan.planId,container:'sample-account',confirm:plan.confirmationCode},deps),e=>e.code===(type==='expired'?'PLAN_EXPIRED':'PLAN_TAMPERED'));
    }
  }finally{if(old===undefined)delete process.env.ECOM_CLI_STATE_DIR;else process.env.ECOM_CLI_STATE_DIR=old;fs.rmSync(dir,{recursive:true});}
});

test('development candidates never advertise an older public stable version as an update',()=>{
  assert.equal(newerStableVersion('0.2.1','0.3.0-dev.0'),false);
  assert.equal(newerStableVersion('0.3.0','0.3.0-dev.0'),true);
  assert.equal(newerStableVersion('0.2.1','0.2.1'),false);
  assert.equal(newerStableVersion('0.2.2','0.2.1'),true);
});

test('new native protocol dispatches every registered service without a Chrome runtime',async()=>{
  let calls=0;
  const connection={endpoint:{businessReadProtocol:1}},deps={discover:()=>connection,registeredRequest:async(c,options,id,params,hash)=>{
    assert.equal(c,connection);assert.equal(options.container,'sample-container');assert.equal(hash,nativeRegistryHash());calls++;
    return {container:{id:'sample-container'},instance:{id:'sample-instance'},operationId:'sample-op',data:{code:0,data:{operation:id}}};
  }};
  for(const op of inventory().operations.filter(operation=>!operation.browserOperation&&!operation.signedDevRoute)){
    const params=Object.fromEntries(op.requiredParams.map(k=>[k,/Time$/.test(k)?'2026-11-01':'sample']));
    const result=await runRead({operation:op.id,container:'sample-container','params-json':JSON.stringify(params)},deps);
    assert.equal(result.businessStatus,'success');assert.equal(result.data.data.operation,op.id);
  }
  assert.equal(calls,135);
});

test('dynamic-module reads resolve native data flows and reject partial or failed expansion',async()=>{
  const body={data:{chart:'##result[0]##',name:'##profile.name##'},info:{ok:true}};
  const flows=[{dataFlowId:'1',response:{data:{resultList:[{result:[{value:7}],profile:{name:'Sample'}}]},info:{ok:true}}}];
  assert.deepEqual(resolveModuleResponse(body,flows).data,{chart:{value:7},name:'Sample'});
  assert.equal(resolveModuleResponse({data:{visible:'##totalInterpret[0].isShow##'}},[{response:{data:{resultList:[{totalInterpret:[{isShow:true}]}]}}}]).data.visible,true);
  assert.throws(()=>resolveModuleResponse(body,[]),e=>e.code==='DATA_FLOW_EXPANSION_REQUIRED');
  assert.throws(()=>resolveModuleResponse(body,[{response:{data:null,info:{ok:false,message:'无权限'}}}]),e=>e.code==='PERMISSION_REQUIRED');
  const deps={discover:()=>({endpoint:{businessReadProtocol:1}}),registeredRequest:async()=>({operationId:'module-op',data:body,dataFlows:flows})};
  const result=await runRead({operation:'alimama.insight.industry-categories',container:'sample','params-json':'{}'},deps);
  assert.equal(result.resolvedResponse.data.chart.value,7);
  const emptyFlows=[{response:{data:{resultList:[]},info:{ok:true}}}];
  const partial=await runRead({operation:'alimama.insight.industry-categories',container:'sample','params-json':'{}'},{...deps,registeredRequest:async()=>({operationId:'partial-op',data:body,dataFlows:emptyFlows})});
  assert.equal(partial.businessStatus,'partial');assert.equal(partial.completeness.complete,false);
  await assert.rejects(runRead({operation:'alimama.insight.industry-categories',container:'sample','params-json':'{}'},{...deps,registeredRequest:async()=>({operationId:'module-op',data:body})}),e=>e.code==='DATA_FLOW_EXPANSION_REQUIRED'&&e.operationId==='module-op');
});

test('CLI-only daily read selects the approved browser route despite catalog drift',async()=>{
  const options={operation:'shop.trade-daily',container:'sample','params-json':'{"date":"2026-11-01"}'};
  const deps={
    discover:()=>({endpoint:{businessReadProtocol:1,businessRouteProtocol:1,businessReadRegistryHash:'different'}}),
    registeredRequest:async(_connection,_options,id,params,hash,route)=>{
      assert.equal(id,'shop.trade-summary');
      assert.equal(params.dateRange,'2026-11-01|2026-11-01');
      assert.equal(params.date,undefined);
      assert.equal(params.dateType,'recent1');
      assert.equal(hash,undefined);
      assert.equal(route.path,'/bda/tradinganaly/overview/get_summary.json');
      return {data:{code:0,data:{}}};
    },
  };
  assert.equal((await runRead(options,deps)).operation,'shop.trade-daily');
  await assert.rejects(runRead({...options,'params-json':'{"date":"2026-02-30"}'},deps),e=>e.code==='INVALID_ARGUMENT');
});

test('transaction overview shares one page across daily and summary schemas and preserves all business fields',async()=>{
  const listed=(await main(['sycm','operations','--json'])).operations;
  const daily=listed.find(({id})=>id==='shop.trade-daily');
  const summary=(await main(['sycm','schema','--operation','shop.trade-summary','--json'])).operation;
  const {pageQuery}=daily;
  assert.equal(pageQuery.name,'生意参谋-交易-销售分析-交易概况');
  assert.ok(pageQuery.aliases.includes('店铺交易概况'));
  assert.ok(pageQuery.searchHints.includes('店铺支付金额'));
  assert.deepEqual(summary.pageQuery,pageQuery);
  assert.equal(pageQuery.modes.daily.operation,daily.id);
  assert.equal(pageQuery.modes.summary.operation,summary.id);
  assert.equal(listed.find(({id})=>id==='shop.trade-trend').pageQuery,undefined);

  const data={code:0,data:{payAmt:12,uv:3,paySubOrderCount:0,newPlatformMetric:42}};
  const summaryParams={dateType:'week',dateRange:'2026-11-16|2026-11-22'};
  const result=await runRead({operation:summary.id,container:'sample','params-json':JSON.stringify(summaryParams)},{
    discover:()=>({endpoint:{businessReadProtocol:1,businessRouteProtocol:1}}),
    registeredRequest:async(_connection,_options,id,params)=>{
      assert.equal(id,summary.id);
      assert.deepEqual(params,{...summaryParams,device:'0'});
      return {data};
    },
  });
  assert.deepEqual(result.data,data);
});

test('signed DMP audience keeps the operation outside the native registry and requires a chart',async()=>{
  const options={operation:'dmp.competitor-audience',container:'sample','params-json':'{"itemId":"123","audienceType":"browse","dimension":"age"}'};
  const deps={
    discover:()=>({endpoint:{businessReadProtocol:1,signedBusinessRouteProtocol:1}}),
    registeredRequest:async(_connection,_options,id,params,hash,route,envelope)=>{
      assert.equal(hash,undefined);
      assert.equal(route,undefined);
      assert.equal(JSON.parse(envelope.payload).id,id);
      assert.equal(params.tagId,114555);
      assert.equal(params.selectTagOptionSetDTO.selectTagOptionSetDTO[0].selects[1].values,'1');
      return {data:{info:{ok:true},data:{result:{chartDataFull:[]}}}};
    },
  };
  assert.equal((await runRead(options,deps)).businessStatus,'success');
  await assert.rejects(runRead({...options,'params-json':'{"itemId":"123","days":14}'},deps),e=>e.code==='INVALID_ARGUMENT');
  await assert.rejects(runRead(options,{...deps,registeredRequest:async()=>({data:{info:{ok:true},data:{}}})}),e=>e.code==='BUSINESS_RESPONSE_INVALID');
});
