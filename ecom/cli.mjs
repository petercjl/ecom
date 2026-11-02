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
  const {positionals,values}=parseArgs({allowPositionals:true,options:{profile:{type:'string'},container:{type:'string'},url:{type:'string'},name:{type:'string'},platform:{type:'string'},service:{type:'string'},'shop-id':{type:'string'},'candidate-id':{type:'string'},json:{type:'boolean'},help:{type:'boolean'}}});
  const [group,action]=positionals;
  if(values.help||!group||group==='help') return {ok:true,usage:'node ecom/cli.mjs shops platforms|list|create|configure|open|verify|confirm；containers list | session get --container <ID或名称> --url <HTTPS URL> [--profile <Ecom Dev 数据目录>] [--json]'};
  if(group==='version') return {ok:true,protocolVersion:1,stage:'native-shop-dev'};
  if(group==='capabilities') return {ok:true,protocolVersion:1,commands:['containers list','session get','shops platforms','shops list','shops create','shops configure','shops open','shops verify','shops confirm'],methods:['GET'],responseTypes:['JSON'],transport:'private-local-mailbox',debuggingRequired:false,platforms:{macos:'development',windows:'not-implemented'}};
  const profile=values.profile||path.join(root,'.brave-build/profiles/Ecom-Dev');
  if(group==='shops') {
    if(['platforms','list'].includes(action)) return nativeCall(profile,{method:'shops.'+action});
    if(action==='create'&&values.name&&values.platform) return nativeCall(profile,{method:'shops.create',name:values.name,platform:values.platform});
    if(action==='configure'&&!values.platform || action==='confirm'&&(!values['shop-id']||!values['candidate-id'])) throw error('INVALID_SHOP_COMMAND','配置需指定平台；确认需指定 shop-id 和本次 candidate-id');
    if(['configure','open','verify','confirm'].includes(action)&&values.container) {
      const listed=await nativeCall(profile,{method:'containers.list'});
      const container=resolveContainer(listed.containers,values.container);
      return nativeCall(profile,{method:'shops.'+action,containerId:container.id,platform:values.platform,service:values.service,shopId:values['shop-id'],candidateId:values['candidate-id']});
    }
    throw error('INVALID_SHOP_COMMAND','shops platforms | list | create --platform taobao --name <店铺名> | configure --container <ID> --platform taobao | open --container <ID> --service sycm|qianniu|alimama | verify --container <ID> | confirm --container <ID> --shop-id <ID> --candidate-id <核验候选ID>');
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
