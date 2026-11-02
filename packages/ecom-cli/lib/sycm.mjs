import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fail,exists,privatePath,writeNew} from './common.mjs';
import {discover,requestInConnection,registeredReadInConnection,openBusinessPageInConnection,callMailbox,resolveContainer} from './browser.mjs';
import {listOperations,operationRegistry,getService,validateOperationParams} from './sycm-vendor/operation-registry.mjs';
import {businessCapabilities,mutationCapabilities} from './sycm-vendor/business-capabilities.mjs';

const ORIGIN='https://sycm.taobao.com';
// Additional first-class reads implemented outside the source registry in src/sycm.mjs.
const legacyReads=[
 ['category.tree','/mc/common/free/getCateInfo.json',[],{marketVersion:'free'}],
 ['category.main','/portal/shop/getMainCateInfo.json',[],{}],
 ['market.item-rank','/mc/mq/mkt/item/offline/rank.json',['cateId','dateRange'],{rankType:'gmv',indexCode:'payByrCnt,uv',page:1,pageSize:10,marketVersion:'free',sellerType:'-1',cateFlag:'2'}],
 ['market.item-flow-rank','/mc/mq/mkt/item/offline/rank/search.json',['cateId','dateRange'],{rankType:'flow',indexCode:'uv,searchUv',page:1,pageSize:10,marketVersion:'free',sellerType:'-1',cateFlag:'2'}],
 ['market.item-add-rank','/mc/mq/mkt/item/offline/rank/purpose.json',['cateId','dateRange'],{rankType:'add',indexCode:'cartByrCnt,cltByrCnt,uv',page:1,pageSize:10,marketVersion:'free',sellerType:'-1',cateFlag:'2'}],
 ['market.price-segments','/mc/mq/mkt/priceSeg/list.json',['cateId','dateRange'],{sellerType:'0',marketVersion:'free'}],
 ['market.keyword-rank','/mc/mq/mkt/keyword/rank/pro.json',['cateId','dateRange'],{kwType:'search',order:'desc',orderBy:'seIpvUvHits',rankType:'hot',page:1,pageSize:10,marketVersion:'free',device:'0'}],
 ['word.overview','/mc/free/searchword/overview.json',['keyword','dateRange'],{device:'0',marketVersion:'free'}],
 ['word.trend','/mc/free/searchword/propertyTrend.json',['keyword','dateRange'],{device:'0',marketVersion:'free'}],
 ['word.related','/mc/mq/mkt/keyword/relate/analysis.json',['keyWord','dateRange'],{cycleFlag:'cycle',order:'desc',orderBy:'seIpvUvHits',rankType:'related',page:1,pageSize:10,device:'0',marketVersion:'free'}],
 ['word.category','/mc/mq/mkt/keyword/cate/analysis.json',['keyWord','dateRange'],{order:'desc',orderBy:'clickHitsRatio',page:1,pageSize:10,device:'0',marketVersion:'free'}]
].map(([id,path,requiredParams,defaultParams])=>({id,service:'sycm',method:'GET',path,requiredParams,defaultParams,sideEffect:'none',source:'src/sycm.mjs'}));
const allOperations=()=>[...listOperations(),...legacyReads];
const resolveOperation=id=>{
  const found=legacyReads.find(x=>x.id===id)??(Object.hasOwn(operationRegistry,id)?operationRegistry[id]:null);
  if(!found)throw fail('UNKNOWN_OPERATION','Choose a registered operation from sycm operations');
  return found;
};

const sensitive=/token|cookie|csrf|password|passwd|authorization|secret|sessionid|credential|api[-_]?key|^__d?tk$|^session$|^loginpointid$/i;
export function assertPublicParams(value) {
  if(Array.isArray(value)){for(const child of value)assertPublicParams(child);return;}
  if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)) {
    if(sensitive.test(key)||['__proto__','constructor','prototype'].includes(key))throw fail('CREDENTIAL_INPUT_REJECTED','Use browser-managed authentication; credential or prototype fields are forbidden');
    assertPublicParams(child);
  }
  if(typeof value==='string'&&/(?:token|cookie|csrf(?:id)?|password|authorization|__tk|__dtk|loginpointid)=/i.test(value))throw fail('CREDENTIAL_INPUT_REJECTED','Credential-bearing strings are forbidden');
}
export function paramsObject(value) {
  if(value===undefined)return {};
  let text=value;
  if(!text.trimStart().startsWith('{')) {
    const info=fs.lstatSync(text);
    if(!info.isFile()||info.size>262144)throw fail('INVALID_ARGUMENT','Parameter input must be a JSON object or a file at most 256 KiB');
    text=fs.readFileSync(text,'utf8');
  }
  if(Buffer.byteLength(text)>262144)throw fail('INVALID_ARGUMENT','Parameter input is too large');
  let result;try{result=JSON.parse(text);}catch{throw fail('INVALID_ARGUMENT','Invalid parameter JSON');}
  if(!result||typeof result!=='object'||Array.isArray(result))throw fail('INVALID_ARGUMENT','Parameters must be a JSON object');
  assertPublicParams(result);return result;
}
const transportFor=op=>op.method==='GET'&&getService(op.service).origin===ORIGIN?'native-session-get':'adapter-required';
export function operationSchema(id) {
  const op=resolveOperation(id), service=getService(op.service);
  return {...op,origin:service.origin,entryUrl:service.entryUrl,tokenStrategy:service.tokenStrategy,transport:'native-business-read',legacyTransport:transportFor(op),runtimeVerified:false,
    minimumBrowserCapability:'businessReadProtocol=1 with matching registry hash',limits:'Credentials remain native. Per-endpoint permissions, CSRF, date semantics and service login require real validation.'};
}
export function nativeRegistry() {
  return Object.fromEntries(inventory().operations.map(op=>[op.id,{
    id:op.id,service:op.service,method:op.method,path:op.path,origin:op.origin,
    entryUrl:op.entryUrl,tokenStrategy:op.tokenStrategy,requiredParams:op.requiredParams,
    defaultParams:op.defaultParams??{},...(op.encoding?{encoding:op.encoding}:{}),
    ...(op.requestShape?{requestShape:op.requestShape,moduleId:op.moduleId,bizCode:op.bizCode,accessBizCode:op.accessBizCode}:{})
  }]));
}
export const nativeRegistryHash=()=>crypto.createHash('sha256').update(JSON.stringify(nativeRegistry())).digest('hex');
export function inventory() {
  return {ok:true,schemaVersion:1,source:{package:'@petercjl/sycmcli',version:'0.4.0',license:'MIT'},
    operations:allOperations().map(op=>operationSchema(op.id)),businessCapabilities,
    mutations:mutationCapabilities.map(x=>({...x,execution:'plan-and-authorization-only',automaticSubmission:false}))};
}
export function buildRead(id,params) {
  const op=resolveOperation(id);assertPublicParams(params);validateOperationParams(op,params);
  if((id.startsWith('market.')||['word.related','word.category'].includes(id))&&params.pageSize!==undefined&&(!Number.isInteger(Number(params.pageSize))||Number(params.pageSize)<1||Number(params.pageSize)>20))throw fail('INVALID_ARGUMENT','Market pageSize must be an integer from 1 through 20');
  if(transportFor(op)!=='native-session-get')throw fail('SERVICE_ADAPTER_REQUIRED','This registered operation requires a native '+op.service+' adapter; no alternate browser will be opened');
  const url=new URL(op.path,ORIGIN);
  for(const [key,value]of Object.entries({...op.defaultParams,...params})) {
    if(value===undefined||value===null)continue;
    if(!['string','number','boolean'].includes(typeof value))throw fail('INVALID_ARGUMENT','Native GET parameters must be scalar values');
    url.searchParams.set(key,String(value));
  }
  return {operation:id,service:op.service,url:url.href};
}
function sanitized(value) {
  if(Array.isArray(value))return value.map(sanitized);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,sensitive.test(key)?'[REDACTED]':sanitized(child)]));
  if(typeof value==='string'&&/(?:token|cookie|csrf(?:id)?|password|authorization|__tk|__dtk|loginpointid)=/i.test(value))return '[REDACTED]';
  return value;
}
export function businessResponse(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail('BUSINESS_RESPONSE_INVALID','Missing business envelope',{executed:true});
  for(const envelope of [value,value.content].filter(x=>x&&typeof x==='object')) {
    const failed=(envelope.code!==undefined&&envelope.code!==null&&![0,200,'0','200','SUCCESS'].includes(envelope.code))||envelope.success===false||envelope.info?.ok===false||envelope.hasError===true;
    if(failed) {
      const text=String(envelope.message??envelope.msg??envelope.info?.message??'');
      const code=/login|登录|会话|session/i.test(text)?'AUTH_REQUIRED':/验证|风控|captcha|risk/i.test(text)?'RISK_VERIFICATION_REQUIRED':/权限|授权|permission|forbidden/i.test(text)?'PERMISSION_REQUIRED':'BUSINESS_REQUEST_FAILED';
      throw fail(code,'Platform rejected the registered read; resolve login, verification or permissions in the selected container',{executed:true});
    }
  }
  if(!Object.hasOwn(value,'data')&&!Object.hasOwn(value,'result')&&!Object.hasOwn(value.content??{},'data'))throw fail('BUSINESS_RESPONSE_INVALID','Unrecognized business data envelope',{executed:true});
  return sanitized(value);
}
export async function runRead(options,deps={}) {
  const params=paramsObject(options['params-json']),op=resolveOperation(options.operation);
  assertPublicParams(params);validateOperationParams(op,params);
  if(Buffer.byteLength(JSON.stringify(params))>24576)throw fail('INVALID_ARGUMENT','Read parameters exceed the native 24 KiB limit');
  const connection=(deps.discover??discover)(options);
  let result;
  if(connection.endpoint.businessReadProtocol===1)result=await (deps.registeredRequest??registeredReadInConnection)(connection,options,op.id,params,nativeRegistryHash());
  else {
    if(transportFor(op)!=='native-session-get')throw fail('BROWSER_UPGRADE_REQUIRED','Upgrade Ecom to native business read protocol 1 for this registered service; keep the existing container login');
    const built=buildRead(options.operation,params);
    result=await (deps.request??requestInConnection)(connection,{...options,url:built.url,method:'GET'});
  }
  try {
    return {...result,operation:op.id,service:op.service,data:businessResponse(result.data),businessStatus:'success',fetchedAt:new Date().toISOString(),dataDateVerification:'caller-must-check-requested-period-and-platform-update-time'};
  }catch(error){error.operationId=result.operationId;throw error;}
}
export async function openOperation(options,deps={}) {
  const op=operationSchema(options.operation),connection=(deps.discover??discover)(options);
  return (deps.open??openBusinessPageInConnection)(connection,options,op.id,op.entryUrl,nativeRegistryHash());
}
async function account(connection,selector) {
  const list=await callMailbox(connection,{method:'shops.list'});
  if(!Array.isArray(list.shops))throw fail('PROTOCOL_MISMATCH','Missing account metadata');
  const row=resolveContainer(list.shops,selector);
  await callMailbox(connection,{method:'shops.verify',containerId:row.id},60000);
  const refreshed=await callMailbox(connection,{method:'shops.list'});
  const current=resolveContainer(refreshed.shops,row.id);
  if(current.state!=='ready'||!current.identity?.shopId||!current.identity?.accountId)throw fail('AUTH_REQUIRED','A verified bound platform identity is required');
  return {id:current.id,name:current.name,identity:{shopId:String(current.identity.shopId),accountId:String(current.identity.accountId)}};
}
function planDirectory(create=false) {
  const state=process.env.ECOM_CLI_STATE_DIR??path.join(os.homedir(),'.ecom-cli');
  if(!path.isAbsolute(state))throw fail('INVALID_ARGUMENT','State directory must be absolute');
  const dir=path.join(state,'sycm-plans');
  for(let p=dir;p!==path.dirname(p);p=path.dirname(p))if(exists(p)&&fs.lstatSync(p).isSymbolicLink()&&!(process.platform==='darwin'&&['/var','/tmp'].includes(p)&&fs.lstatSync(p).uid===0))throw fail('UNSAFE_PATH','Plan state must use physical directories');
  if(create)fs.mkdirSync(dir,{recursive:true,mode:0o700});privatePath(dir,true);return dir;
}
function planFile(id) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id??''))throw fail('INVALID_ARGUMENT','Invalid plan ID');
  return path.join(planDirectory(),id+'.json');
}
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function mutation(id) {
  const item=mutationCapabilities.find(x=>x.id===id);
  if(!item)throw fail('UNKNOWN_MUTATION','Choose a registered mutation from sycm capabilities');
  return item;
}
export async function planMutation(options,deps={}) {
  const cap=mutation(options.operation),payload=paramsObject(options['params-json']);
  for(const key of cap.requiredFields)if(payload[key]===undefined||payload[key]===null)throw fail('INVALID_ARGUMENT','Missing mutation field: '+key);
  const connection=(deps.discover??discover)(options),target=await (deps.account??account)(connection,options.container);
  const planId=crypto.randomUUID(),confirmationCode=crypto.randomBytes(4).toString('hex').toUpperCase(),now=Date.now();
  const plan={schemaVersion:1,planId,capabilityId:cap.id,idempotencyKey:crypto.randomUUID(),container:target,instanceId:connection.endpoint.instanceId,payload,payloadDigest:digest(payload),confirmationDigest:digest({planId,confirmationCode}),createdAt:new Date(now).toISOString(),expiresAt:new Date(now+900000).toISOString()};
  planDirectory(true);
  writeNew(planFile(planId),plan);
  return {ok:true,plan:{...publicPlan(plan),confirmationCode,payload:sanitized(payload)},executed:false,automaticSubmission:false};
}
function loadPlan(id) {const file=planFile(id);privatePath(file);return JSON.parse(fs.readFileSync(file,'utf8'));}
function publicPlan(plan) {
  const {payload,confirmationDigest,...result}=plan;
  return {...result,payloadFields:Object.keys(payload).sort(),status:exists(planFile(plan.planId)+'.authorized')?'authorized':'planned'};
}
export function showPlan(id) {return {ok:true,plan:publicPlan(loadPlan(id)),executed:false,automaticSubmission:false};}
export async function authorizePlan(options,deps={}) {
  const plan=loadPlan(options.plan),cap=mutation(plan.capabilityId),file=planFile(plan.planId)+'.authorized';
  if(exists(file))throw fail('PLAN_ALREADY_USED','Plan already authorized; inspect it before further action');
  if(Date.parse(plan.expiresAt)<=Date.now())throw fail('PLAN_EXPIRED','Create and review a new plan');
  if(plan.payloadDigest!==digest(plan.payload))throw fail('PLAN_TAMPERED','Payload digest mismatch');
  if(plan.confirmationDigest!==digest({planId:plan.planId,confirmationCode:(options.confirm??'').toUpperCase()}))throw fail('CONFIRMATION_FAILED','Wrong confirmation code');
  const connection=(deps.discover??discover)(options),target=await (deps.account??account)(connection,options.container);
  if(connection.endpoint.instanceId!==plan.instanceId||target.id!==plan.container.id||JSON.stringify(target.identity)!==JSON.stringify(plan.container.identity))throw fail('STORE_IDENTITY_MISMATCH','Instance, container or platform identity differs from the reviewed plan');
  try{writeNew(file,{planId:plan.planId,authorizedAt:new Date().toISOString(),payloadDigest:plan.payloadDigest});}catch(e){if(e.code==='EEXIST')throw fail('PLAN_ALREADY_USED','Plan already authorized');throw e;}
  return {ok:true,planId:plan.planId,status:'authorized',executed:false,automaticSubmission:false,container:target,payload:sanitized(plan.payload),workflow:{...cap,readbackRequired:true},nextAction:'Execute only the reviewed workflow using an explicitly supported browser capability; return real readback evidence. This command performs no platform mutation.'};
}
