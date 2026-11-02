import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {fail,privatePath,writeNew,exists} from './common.mjs';
const ps=(args)=>execFileSync('/bin/ps',args,{encoding:'utf8',timeout:3000,maxBuffer:4*1024*1024});
export function discover({profile,instance}={}) {
  if(process.platform!=='darwin') throw fail('PLATFORM_UNSUPPORTED','Browser transport currently supports macOS; no debugging fallback is available');
  const candidates=[];
  for(const line of ps(['-axo','pid=,uid=,comm=']).split('\n')) {
    const m=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if(!m || Number(m[2])!==process.getuid() || !/\/(Ecom Dev|Ecom)\.app\/Contents\/MacOS\/\1$/.test(m[3])) continue;
    let command; try {command=ps(['-ww','-p',m[1],'-o','command=']).trim();}catch{continue;}
    if(/--(?:remote-debugging|headless|enable-automation)/.test(command)) continue;
    const selected=command.match(/(?:^| )--user-data-dir=(.*?)(?= --|$)/)?.[1];
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
export async function listContainers(options={}) {return readMailbox(discover(options));}
export async function readMailbox({folder,endpoint,channel},timeoutMs=10000) {
  privatePath(folder,true);privatePath(path.join(folder,'endpoint.json'));
  const current=JSON.parse(fs.readFileSync(path.join(folder,'endpoint.json'),'utf8'));
  if(current.pid!==endpoint.pid || current.instanceId!==endpoint.instanceId || current.authToken!==endpoint.authToken) throw fail('INSTANCE_CHANGED','Instance changed before submission; discover it again');
  const id=crypto.randomUUID(), request=path.join(folder,id+'.request.json'), temporary=path.join(folder,id+'.request.tmp'), response=path.join(folder,id+'.response.json');
  if(exists(request)||exists(response)) throw fail('OPERATION_COLLISION','Request already exists');
  writeNew(temporary,{schemaVersion:1,instanceId:endpoint.instanceId,authToken:endpoint.authToken,method:'containers.list'});
  fs.renameSync(temporary,request);
  const end=Date.now()+timeoutMs;
  while(Date.now()<end) {
    if(exists(response)) {
      privatePath(response);
      const raw=fs.readFileSync(response,'utf8');
      if(Buffer.byteLength(raw)>1024*1024) throw fail('PROTOCOL_MISMATCH','Oversized response',{operationId:id,executed:'unknown'});
      let body;try{body=JSON.parse(raw);}catch{await pause(25);continue;}
      if(body.schemaVersion!==1 || body.instanceId!==endpoint.instanceId || body.operationId!==id) throw fail('PROTOCOL_MISMATCH','Response does not match this operation',{operationId:id,executed:'unknown'});
      fs.unlinkSync(response);
      if(body.ok!==true) throw fail('BROWSER_ERROR','Browser refused read-only request',{operationId:id,executed:body.error?.executed??false});
      if(!Array.isArray(body.containers)||body.containers.some(c=>typeof c.id!=='string'||typeof c.name!=='string')) throw fail('PROTOCOL_MISMATCH','Invalid container list',{operationId:id,executed:'unknown'});
      return {ok:true,schemaVersion:1,operationId:id,instance:{id:endpoint.instanceId,pid:endpoint.pid,channel},containers:body.containers.map(({id,name})=>({id,name}))};
    }
    await pause(25);
  }
  throw fail('OPERATION_TIMEOUT','Read timed out; retain operation ID and inspect instance before retrying',{operationId:id,executed:'unknown'});
}
