import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {fail,privatePath,writeNew,exists} from './common.mjs';
const ps=(args)=>execFileSync('/bin/ps',args,{encoding:'utf8',timeout:3000,maxBuffer:4*1024*1024});
export function processProfile(executable,command) {
  const explicit=command.match(/(?:^| )--user-data-dir=(.*?)(?= --|$)/)?.[1];
  if(explicit)return explicit;
  if(executable.endsWith('/Ecom.app/Contents/MacOS/Ecom'))return path.join(os.homedir(),'Library','Application Support','Ecom','Ecom');
  return null;
}
export function discover({profile,instance}={}) {
  if(process.platform!=='darwin') throw fail('PLATFORM_UNSUPPORTED','Browser transport currently supports macOS; no debugging fallback is available');
  const candidates=[];
  for(const line of ps(['-axo','pid=,uid=,comm=']).split('\n')) {
    const m=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if(!m || Number(m[2])!==process.getuid() || !/\/(Ecom Dev|Ecom)\.app\/Contents\/MacOS\/\1$/.test(m[3])) continue;
    let command; try {command=ps(['-ww','-p',m[1],'-o','command=']).trim();}catch{continue;}
    if(/--(?:remote-debugging|headless|enable-automation)/.test(command)) continue;
    const selected=processProfile(m[3],command);
    if(!selected || !path.isAbsolute(selected) || (profile && path.resolve(profile)!==path.resolve(selected))) continue;
    const folder=path.join(selected,'Default','.ecom-native-cli'), file=path.join(folder,'endpoint.json');
    if(!exists(file)) continue;
    privatePath(folder,true);privatePath(file);
    const endpoint=JSON.parse(fs.readFileSync(file,'utf8'));
    if(endpoint.product!=='Ecom' || endpoint.schemaVersion!==1 || endpoint.pid!==Number(m[1]) || endpoint.executable!==m[3] || endpoint.userDataDir!==selected || !/^[\da-f-]{36}$/.test(endpoint.instanceId) || typeof endpoint.authToken!=='string') continue;
    if(instance && endpoint.instanceId!==instance) continue;
    candidates.push({folder,endpoint,channel:m[3].includes('/Ecom Dev.app/')?'dev':'stable'});
  }
  if(candidates.length!==1) throw fail(candidates.length?'INSTANCE_AMBIGUOUS':'INSTANCE_NOT_RUNNING',candidates.length?'Multiple Ecom instances; specify --profile or --instance':'Open an Ecom build supporting this CLI in normal desktop mode');
  return candidates[0];
}
const instanceOf=({endpoint,channel})=>({id:endpoint.instanceId,pid:endpoint.pid,channel});
const credentialKey=/token|cookie|csrf|password|authorization|secret|sessionid|api[-_]?key|access[-_]?key|credential|^__d?tk$|^session$|^loginpointid$/i;
function homeUrl(value) {
  try {
    const url=new URL(value);if(url.protocol!=='https:')return null;
    url.username='';url.password='';
    for(const [key,value]of url.searchParams)if(credentialKey.test(key)||credentialKey.test(value)&&/[=%]/.test(value))url.searchParams.set(key,'[REDACTED]');
    if(credentialKey.test(url.hash))url.hash='[REDACTED]';
    return url.href;
  }catch{return null;}
}
export function resolveContainer(items,value) {
  if(typeof value!=='string'||!value.trim())throw fail('INVALID_ARGUMENT','Specify --container with a stable ID or unique exact name');
  const matches=items.filter(c=>c.id===value||c.name===value);
  if(matches.length!==1)throw fail(matches.length?'CONTAINER_AMBIGUOUS':'CONTAINER_NOT_FOUND','Select an existing stable container ID or unique exact name');
  return matches[0];
}
export function validateReadUrl(value,method='GET') {
  if(method!=='GET')throw fail('METHOD_UNSUPPORTED','This version supports explicit read-only GET operations only');
  let url;try{url=new URL(value);}catch{throw fail('INVALID_URL','Specify an absolute HTTPS URL');}
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw fail('INVALID_URL','HTTPS URL must have no credentials or fragment');
  for(const [key,value]of url.searchParams)if(credentialKey.test(key)||credentialKey.test(value)&&/[=%]/.test(value))throw fail('CREDENTIAL_INPUT_REJECTED','Credentials remain in the browser; credential query parameters are not accepted');
  return url.href;
}
export async function listContainers(options={}) {return readMailbox(discover(options));}
export async function readMailbox(connection,timeoutMs=10000) {
  const body=await callMailbox(connection,{method:'containers.list'},timeoutMs);
  if(!Array.isArray(body.containers)||body.containers.some(c=>typeof c.id!=='string'||typeof c.name!=='string'))throw fail('PROTOCOL_MISMATCH','Invalid container list',{operationId:body.operationId,executed:'unknown'});
  return {...body,instance:instanceOf(connection),containers:body.containers.map(({id,name})=>({id,name}))};
}
export async function inspectContainer(options={}) {
  if(!options.container)throw fail('INVALID_ARGUMENT','containers inspect requires --container');
  return inspectInConnection(discover(options),options.container);
}
export async function inspectInConnection(connection,selector) {
  const body=await callMailbox(connection,{method:'shops.list'});
  if(!Array.isArray(body.shops)||body.shops.some(c=>typeof c.id!=='string'||typeof c.name!=='string'))throw fail('PROTOCOL_MISMATCH','Invalid account metadata',{operationId:body.operationId,executed:'unknown'});
  const row=resolveContainer(body.shops,selector);
  const string=x=>typeof x==='string'?x:null;
  const container={id:row.id,name:row.name,platform:string(row.platform),platformName:string(row.customPlatformName),homeUrl:homeUrl(row.homeUrl),icon:Number.isInteger(row.icon)?row.icon:null,color:string(row.color),
    login:{state:string(row.state)??'unconfigured',service:string(row.authentication?.service),authenticationState:string(row.authentication?.state),verificationSupported:row.verificationSupported===true,checking:row.checking===true,checkedAt:string(row.checkedAt),identityBound:!!row.identity,identityConfirmed:row.state==='ready'&&!!row.identity,expiry:row.expiry?{kind:string(row.expiry.kind),cookieExpiresAt:string(row.expiry.cookieExpiresAt)}:null}};
  return {ok:true,schemaVersion:1,operationId:body.operationId,instance:instanceOf(connection),container};
}
export async function requestSession(options={}) {
  if(!options.container||!options.url)throw fail('INVALID_ARGUMENT','session request requires --container and --url');
  const url=validateReadUrl(options.url,options.method??'GET');
  return requestInConnection(discover(options),{...options,url});
}
export async function requestInConnection(connection,options) {
  const url=validateReadUrl(options.url,options.method??'GET');
  if(!connection.endpoint.allowedOrigin||new URL(url).origin!==connection.endpoint.allowedOrigin)throw fail('ORIGIN_NOT_ALLOWED','URL must match the HTTPS origin explicitly enabled by this Ecom instance');
  const listed=await readMailbox(connection);
  const container=resolveContainer(listed.containers,options.container);
  const body=await callMailbox(connection,{method:'session.get',containerId:container.id,url},60000);
  if(body.containerId!==container.id||body.httpStatus!==200||!Object.hasOwn(body,'data'))throw fail('PROTOCOL_MISMATCH','Session response does not match selected container or JSON response contract',{operationId:body.operationId,executed:'unknown'});
  return {ok:true,schemaVersion:1,operationId:body.operationId,instance:instanceOf(connection),container,request:{method:'GET',url},httpStatus:body.httpStatus,data:body.data,businessStatus:'not-evaluated'};
}
export async function registeredReadInConnection(connection,options,operation,params,registryHash) {
  if(connection.endpoint.businessReadProtocol!==1)throw fail('BROWSER_UPGRADE_REQUIRED','This operation needs an Ecom build with native business read protocol 1');
  if(connection.endpoint.businessReadRegistryHash!==registryHash)throw fail('BROWSER_UPGRADE_REQUIRED','Browser and CLI business catalogs differ; update them together');
  const listed=await readMailbox(connection),container=resolveContainer(listed.containers,options.container);
  const body=await callMailbox(connection,{method:'business.read',containerId:container.id,operation,params},75000);
  if(body.containerId!==container.id||body.businessOperation!==operation||body.httpStatus!==200||!Object.hasOwn(body,'data'))throw fail('PROTOCOL_MISMATCH','Registered response differs from the pinned container or operation',{operationId:body.operationId,executed:'unknown'});
  return {ok:true,schemaVersion:1,operationId:body.operationId,instance:instanceOf(connection),container,operation,httpStatus:body.httpStatus,data:body.data,...(Array.isArray(body.dataFlows)&&body.dataFlows.length?{dataFlows:body.dataFlows}:{}),transport:'native-business-read',identityBinding:'container-bound-account',registryHash};
}
export async function openBusinessPageInConnection(connection,options,operation,entryUrl,registryHash) {
  if(connection.endpoint.businessPageOpenProtocol!==1||connection.endpoint.businessReadRegistryHash!==registryHash)throw fail('BROWSER_UPGRADE_REQUIRED','Update Ecom to the matching registered-page navigation capability');
  const listed=await readMailbox(connection),container=resolveContainer(listed.containers,options.container);
  const background=!options.foreground;
  const body=await callMailbox(connection,{method:'shops.open',containerId:container.id,businessOperation:operation,background,reuse:background});
  if(body.containerId!==container.id||!['started','reused'].includes(body.navigation)||body.requestedUrl!==entryUrl)throw fail('PROTOCOL_MISMATCH','Navigation target differs from the registered container or entry page',{operationId:body.operationId,executed:'unknown'});
  return {ok:true,schemaVersion:1,operationId:body.operationId,instance:instanceOf(connection),container,operation,requestedUrl:body.requestedUrl,navigation:body.navigation,background,authentication:'not-verified'};
}
function safeDiagnostics(value) {
  if(!value||typeof value!=='object')return undefined;
  const result={};
  if(typeof value.phase==='string'&&/^[a-z-]{1,32}$/.test(value.phase))result.phase=value.phase;
  if(Number.isInteger(value.netError)&&value.netError<=0&&value.netError>=-9999)result.netError=value.netError;
  if(['json','html','text','none'].includes(value.bodyKind))result.bodyKind=value.bodyKind;
  if(typeof value.matchingTabFound==='boolean')result.matchingTabFound=value.matchingTabFound;
  if(Number.isInteger(value.entryCookieCount)&&value.entryCookieCount>=0&&value.entryCookieCount<=100000)result.entryCookieCount=value.entryCookieCount;
  if(['unclassified','cors-rejected','csrf-rejected','verification-required','forbidden'].includes(value.failureClass))result.failureClass=value.failureClass;
  if(Array.isArray(value.publicScripts))result.publicScripts=value.publicScripts.slice(0,20).filter(url=>{
    try{const item=new URL(url);return item.protocol==='https:'&&item.hostname==='g.alicdn.com'&&!item.username&&!item.password&&!item.search&&!item.hash&&item.pathname.endsWith('.js')&&url.length<2048;}catch{return false;}
  });
  return Object.keys(result).length?result:undefined;
}
export async function callMailbox({folder,endpoint},payload,timeoutMs=10000) {
  privatePath(folder,true);privatePath(path.join(folder,'endpoint.json'));
  const current=JSON.parse(fs.readFileSync(path.join(folder,'endpoint.json'),'utf8'));
  if(current.pid!==endpoint.pid || current.instanceId!==endpoint.instanceId || current.authToken!==endpoint.authToken) throw fail('INSTANCE_CHANGED','Instance changed before submission; discover it again');
  const id=crypto.randomUUID(), request=path.join(folder,id+'.request.json'), temporary=path.join(folder,id+'.request.tmp'), response=path.join(folder,id+'.response.json');
  if(exists(request)||exists(response)) throw fail('OPERATION_COLLISION','Request already exists');
  writeNew(temporary,{...payload,schemaVersion:1,instanceId:endpoint.instanceId,authToken:endpoint.authToken});
  fs.renameSync(temporary,request);
  const end=Date.now()+timeoutMs;
  while(Date.now()<end) {
    if(exists(response)) {
      privatePath(response);
      const raw=fs.readFileSync(response,'utf8');
      if(Buffer.byteLength(raw)>(['session.get','business.read'].includes(payload.method)?2*1024*1024+65536:1024*1024)) throw fail('PROTOCOL_MISMATCH','Oversized response',{operationId:id,executed:'unknown'});
      let body;try{body=JSON.parse(raw);}catch{await pause(25);continue;}
      if(body.schemaVersion!==1 || body.instanceId!==endpoint.instanceId || body.operationId!==id) throw fail('PROTOCOL_MISMATCH','Response does not match this operation',{operationId:id,executed:'unknown'});
      fs.unlinkSync(response);
      if(body.ok!==true) {
        const code=/^[A-Z][A-Z0-9_]{0,63}$/.test(body.error?.code??'')?body.error.code:'BROWSER_ERROR';
        const diagnostics=safeDiagnostics(body.error?.diagnostics);
        throw fail(code,'Ecom refused the request: '+code,{operationId:id,executed:body.error?.executed??'unknown',...(Number.isInteger(body.error?.httpStatus)?{httpStatus:body.error.httpStatus}:{}),...(diagnostics?{diagnostics}:{})});
      }
      return body;
    }
    await pause(25);
  }
  throw fail('OPERATION_TIMEOUT','Read timed out; retain operation ID and inspect instance before retrying',{operationId:id,executed:'unknown'});
}
