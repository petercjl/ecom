#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const error = (code,message,details={}) => Object.assign(new Error(message),{code,...details});
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
function privatePath(file,directory=false) {
  const info=fs.lstatSync(file);
  if (info.uid!==process.getuid() || (info.mode&0o777)!==(directory?0o700:0o600) || (directory?!info.isDirectory():!info.isFile()||info.nlink!==1)) throw error('UNSAFE_LOCAL_ENDPOINT','本地会话入口权限或类型不符合要求');
}
export function validateReadUrl(text) {
  const url=new URL(text);
  if(url.protocol!=='https:'||url.username||url.password) throw error('INVALID_URL','只支持不含凭证的 HTTPS 只读请求');
  for(const key of url.searchParams.keys()) if(/token|cookie|csrf|password|authorization|secret|sessionid/i.test(key)) throw error('CREDENTIAL_INPUT_REJECTED','凭证由浏览器会话管理，命令不接受凭证参数');
  return url.href;
}
export function resolveContainer(items,value) {
  const matches=items.filter(c=>c.id===value||c.name===value);
  if(matches.length!==1) throw error(matches.length?'CONTAINER_AMBIGUOUS':'CONTAINER_NOT_FOUND','请指定唯一的现有容器名称或 ID');
  return matches[0];
}
export async function nativeCall(profile,request) {
  if(process.platform!=='darwin') throw error('PLATFORM_UNVERIFIED','当前原生会话入口仅验证 macOS');
  profile=path.resolve(profile);
  const folder=path.join(profile,'Default/.ecom-native-cli');
  const endpointFile=path.join(folder,'endpoint.json');
  if(!fs.existsSync(endpointFile)) throw error('NATIVE_SERVICE_UNAVAILABLE','当前 Ecom 未提供原生会话入口；请先构建并重启支持此能力的 Ecom Dev');
  privatePath(folder,true);privatePath(endpointFile);
  const endpoint=JSON.parse(fs.readFileSync(endpointFile,'utf8'));
  if(endpoint.schemaVersion!==1||!Number.isSafeInteger(endpoint.pid)||endpoint.pid<=0||!endpoint.instanceId||!endpoint.authToken) throw error('INVALID_ENDPOINT','本地会话入口格式无效');
  const expected=path.join(root,'.brave-build/src/out',process.arch==='arm64'?'Component_arm64':'Component','Ecom Dev.app/Contents/MacOS/Ecom Dev');
  const result=spawnSync('ps',['-ww','-p',String(endpoint.pid),'-o','uid=,command='],{encoding:'utf8'});
  const match=result.stdout?.trim().match(/^(\d+)\s+(.+)$/);
  if(result.status!==0||!match||Number(match[1])!==process.getuid()||!match[2].startsWith(expected+' ')||!match[2].split(' ').includes('--user-data-dir='+profile)) throw error('INSTANCE_NOT_RUNNING','原生入口不属于当前工作区、用户及数据目录的运行实例');
  if(/--(?:remote-debugging|headless|enable-automation)/.test(match[2])) throw error('LAUNCH_MODE_CONFLICT','当前只支持普通有界面且无远程调试参数的 Ecom');
  const id=crypto.randomUUID(); const temporary=path.join(folder,id+'.request.tmp');const target=path.join(folder,id+'.request.json');const response=path.join(folder,id+'.response.json');
  for(const p of [temporary,target,response]) if(fs.existsSync(p)) throw error('OPERATION_COLLISION','操作路径已存在');
  fs.writeFileSync(temporary,JSON.stringify({...request,schemaVersion:1,instanceId:endpoint.instanceId,authToken:endpoint.authToken}),{flag:'wx',mode:0o600});
  fs.renameSync(temporary,target);
  const end=Date.now()+30000;
  while(Date.now()<end) {
    if(fs.existsSync(response)) {
      privatePath(response);
      let body;try {body=JSON.parse(fs.readFileSync(response,'utf8'));}catch {await pause(50);continue;}
      if(body.operationId!==id||body.instanceId!==endpoint.instanceId||body.schemaVersion!==1) throw error('PROTOCOL_MISMATCH','原生响应与本次实例或操作不匹配',{operationId:id});
      fs.unlinkSync(response);
      if(!body.ok) throw error(body.error?.code||'NATIVE_ERROR','原生会话请求未成功',{operationId:id,executed:body.error?.executed,httpStatus:body.error?.httpStatus});
      return body;
    }
    await pause(50);
  }
  throw error('OPERATION_TIMEOUT','等待原生响应超时；保留操作记录，结果未知，不自动重试',{operationId:id,executed:'unknown'});
}

async function main() {
  const {positionals,values}=parseArgs({allowPositionals:true,options:{profile:{type:'string'},container:{type:'string'},keyword:{type:'string'},'probe-target':{type:'string'},url:{type:'string'},name:{type:'string'},platform:{type:'string'},service:{type:'string'},'shop-id':{type:'string'},'candidate-id':{type:'string'},icon:{type:'string'},color:{type:'string'},'confirmation-id':{type:'string'},'custom-platform-name':{type:'string'},'entry-url':{type:'string'},'account-type':{type:'string'},'home-url':{type:'string'},'web-rtc-policy':{type:'string'},language:{type:'string'},timezone:{type:'string'},json:{type:'boolean'},help:{type:'boolean'}}});
  const [group,action]=positionals;
  if(values.help||!group||group==='help') return {ok:true,usage:'node ecom/cli.mjs shops manage|platforms|list|refresh|create|configure|open|verify|confirm|update|delete-preview|delete；containers list | session get --container <ID或名称> --url <HTTPS URL> [--profile <Ecom Dev 数据目录>] [--json]；小红书 Cookie 验证：xhs probe --container <ID或名称> [--probe-target search|search-v2|self] [--keyword <关键词>]；账号首页：--home-url <HTTPS页面网址>；WebRTC：--web-rtc-policy <inherit|disable-non-proxied-udp>；千牛登录提交：shops submit-login --container <ID或名称>；本地登录模拟：shops submit-login-fixture --container <ID或名称>；容器环境：--language <语言代码|inherit> --timezone <IANA时区|inherit>，保存后重启 Ecom'};
  if(group==='version') return {ok:true,protocolVersion:1,stage:'native-shop-dev'};
  if(group==='memory'&&['status','tabs','processes','containers'].includes(action)) {
    const {main: productMain}=await import('../packages/ecom-cli/lib/cli.mjs');
    return productMain(process.argv.slice(2));
  }
  if(group==='capabilities') return {ok:true,protocolVersion:1,commands:['xhs probe','containers list','session get','shops manage','shops platforms','shops list','shops create','shops configure','shops open','shops submit-login','shops submit-login-fixture','shops verify','shops confirm','shops refresh','shops update','shops delete-preview','shops delete'],methods:['GET'],responseTypes:['JSON'],transport:'private-local-mailbox',debuggingRequired:false,platforms:{macos:'development',windows:'not-implemented'}};
  const profile=values.profile||path.join(root,'.brave-build/profiles/Ecom-Dev');
  if(group==='xhs'&&['probe','search'].includes(action)) {
    const target=action==='search'?'page':values['probe-target']||'search';
    if(!['search','search-v2','self','page'].includes(target)) throw error('INVALID_ARGUMENT','probe-target: search|search-v2|self');
    const keyword=values.keyword?.trim();
    if(!values.container||(target!=='self'&&(!keyword||Buffer.byteLength(keyword)>180)))
      throw error('INVALID_ARGUMENT','请提供容器和有效关键词');
    const listed=await nativeCall(profile,{method:'containers.list'});
    const container=resolveContainer(listed.containers,values.container);
    const searchId=((BigInt(Date.now())<<64n)+BigInt(crypto.randomInt(2147483647))).toString(36).toUpperCase();
    const operation=target==='page'?'xhs.search-page':'xhs.'+target+'-cookie-probe';
    const result=await nativeCall(profile,{method:'business.read',operation,
      containerId:container.id,params:target==='self'?{}:{keyword,search_id:searchId}});
    if(result.containerId!==container.id||result.businessOperation!==operation)
      throw error('PROTOCOL_MISMATCH','小红书响应与指定容器不匹配');
    const body=result.data;
    if(target==='page') {
      if(body?.success!==true||!Array.isArray(body.data?.items)||!body.data.items.length) throw error('XHS_SEARCH_REJECTED','小红书未返回搜索列表');
      return {ok:true,container:{id:container.id,name:container.name},operationId:result.operationId,transport:body.transport,keyword,count:body.data.items.length,items:body.data.items};
    }
    const success=body?.success===true&&(target==='self'?typeof body.data?.user_id==='string':Array.isArray(body.data?.items)&&typeof body.data.has_more==='boolean');
    if(!success) process.exitCode=1;
    return {ok:success,target,container:container.name,httpStatus:result.httpStatus,
      platformCode:Number.isInteger(body?.code)?body.code:null,
      ...(success?(target==='self'?{authenticated:true}:{items:body.data.items.length,hasMore:body.data.has_more}):{error:{code:target==='self'?'XHS_SESSION_CHECK_REJECTED':'XHS_SEARCH_REJECTED'}})};
  }
  if(group==='shops') {
    if(['manage','platforms','list','refresh'].includes(action)) return nativeCall(profile,{method:'shops.'+action});
    if(action==='create'&&values.name&&values.platform) return nativeCall(profile,{method:'shops.create',name:values.name,platform:values.platform,customPlatformName:values['custom-platform-name'],entryUrl:values['entry-url'],accountType:values['account-type'],homeUrl:values['home-url'],webRtcPolicy:values['web-rtc-policy'],browserLanguage:values.language,browserTimezone:values.timezone,...(values.icon!==undefined?{icon:Number(values.icon)}:{}),...(values.color?{color:values.color}:{})});
    if(action==='update'&&!values.name&&values.icon===undefined&&!values.color&&!values['home-url']&&!values['account-type']&&values['web-rtc-policy']===undefined&&values.language===undefined&&values.timezone===undefined || action==='delete'&&!values['confirmation-id']) throw error('INVALID_SHOP_COMMAND','编辑需指定至少一项设置；删除需先预览并提交 confirmation-id');
    if(action==='configure'&&!values.platform || action==='confirm'&&(!values['shop-id']||!values['candidate-id'])) throw error('INVALID_SHOP_COMMAND','配置需指定平台；确认需指定 shop-id 和本次 candidate-id');
    if(['configure','open','submit-login','submit-login-fixture','verify','confirm','update','delete-preview','delete'].includes(action)&&values.container) {
      const listed=await nativeCall(profile,{method:'containers.list'});
      const container=resolveContainer(listed.containers,values.container);
      return nativeCall(profile,{method:'shops.'+action,containerId:container.id,platform:values.platform,service:values.service,shopId:values['shop-id'],candidateId:values['candidate-id'],name:values.name,...(values.icon!==undefined?{icon:Number(values.icon)}:{}),color:values.color,confirmationId:values['confirmation-id'],customPlatformName:values['custom-platform-name'],entryUrl:values['entry-url'],accountType:values['account-type'],homeUrl:values['home-url'],webRtcPolicy:values['web-rtc-policy'],browserLanguage:values.language,browserTimezone:values.timezone});
    }
    throw error('INVALID_SHOP_COMMAND','shops manage | platforms | list | create --platform taobao|douyin|pinduoduo|jd|xiaohongshu|custom --name <店铺名> [--custom-platform-name <名称> --entry-url <HTTPS网址>] | configure --container <ID> --platform taobao [--account-type merchant|buyer] | open --container <ID> --service sycm|qianniu|alimama|taobao|home | submit-login --container <ID> | submit-login-fixture --container <ID> | verify --container <ID> | confirm --container <ID> --shop-id <ID> --candidate-id <核验候选ID> | update --container <ID> [--name <名称>] [--icon <0..10>] [--color <#RRGGBB>] [--home-url <HTTPS页面网址>] | delete-preview --container <ID> | delete --container <ID> --confirmation-id <预览ID>');
  }
  if(group==='containers'&&action==='list') return nativeCall(profile,{method:'containers.list'});
  if(group==='session'&&action==='get'&&values.container&&values.url) {
    const items=await nativeCall(profile,{method:'containers.list'});
    const container=resolveContainer(items.containers,values.container);
    const result=await nativeCall(profile,{method:'session.get',containerId:container.id,url:validateReadUrl(values.url)});
    return {...result,container:{id:container.id,name:container.name}};
  }
  throw error('UNSUPPORTED_COMMAND','使用 --help 查看当前最小命令范围');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(e=>{
  process.stderr.write(JSON.stringify({ok:false,error:{code:e.code||'CLI_ERROR',message:e.message,...(e.operationId?{operationId:e.operationId}:{}),...(e.executed!==undefined?{executed:e.executed}:{}),...(e.httpStatus!==undefined?{httpStatus:e.httpStatus}:{})}})+'\n');process.exitCode=1;
});
