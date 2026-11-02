#!/usr/bin/env node
// Bounded read-only integration probe; all business HTTP stays in sycmcli/Ecom.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { values } = parseArgs({ options: { 'sycm-entry': {type:'string'}, container:{type:'string',multiple:true}, date:{type:'string'}, help:{type:'boolean'} } });
if(values.help){ console.log('node ecom/experiments/native-multicontainer-probe.mjs --sycm-entry <absolute sycmcli module> --container <name-or-ID> --container <name-or-ID> --date YYYY-MM-DD\nRuns six registered GET reads: A→B, concurrent A+B, B→A; stops on first failed round. Saves private local evidence.');process.exit(0); }
if(!values['sycm-entry'] || !path.isAbsolute(values['sycm-entry']) || values.container?.length!==2 || !/^\d{4}-\d{2}-\d{2}$/.test(values.date||'')) throw new Error('Pass an absolute sycm-entry, exactly two containers and an explicit date.');
const entry=values['sycm-entry']; if(!fs.statSync(entry).isFile()) throw new Error('sycm-entry is not a file');
const buildRoot=path.join(root,'.brave-build');if(!fs.statSync(buildRoot).isDirectory())throw new Error('Missing development workspace');
const folder=fs.mkdtempSync(path.join(buildRoot,'native-multicontainer-'));fs.chmodSync(folder,0o700);
const evidence=path.join(folder,'result.json');if(fs.existsSync(evidence))throw new Error('Evidence already exists');
const args=['--ecom-cli',path.join(root,'ecom/cli.mjs')];
const invoke=async argv=>JSON.parse((await run(process.execPath,[entry,'ecom',...argv,...args],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:40000})).stdout);
const result={schemaVersion:1,startedAt:new Date().toISOString(),date:values.date,transport:'ecom-native-session',debugging:false,rounds:[],identityVerification:'container-selection-only'};
let accepted=0;
try {
 const listed=await invoke(['containers']);
 const targets=values.container.map(value=>{const matches=listed.containers.filter(c=>c.id===value||c.name===value);if(matches.length!==1)throw Error('Container must uniquely exist');return matches[0];});
 if(targets[0].id===targets[1].id)throw Error('Two distinct containers required');
 result.containers=targets;result.instanceId=listed.instanceId;
 const fetch=async c=>{
  const start=performance.now();
  const body=await invoke(['run','shop.trade-summary','--container',c.id,'--params-json',JSON.stringify({dateType:'recent1',dateRange:values.date+'|'+values.date,device:'0'})]);
  if(!body.ok||body.instanceId!==listed.instanceId||body.container.id!==c.id||body.response.code!==0||!body.response.data)throw Error('Business success/target verification failed');
  const data=body.response.data;
  return {container:c,instanceId:body.instanceId,operationId:body.operationId,elapsedMs:Math.round(performance.now()-start),businessCode:body.response.code,fingerprint:crypto.createHash('sha256').update(JSON.stringify(Object.entries(data).sort(([a],[b])=>a.localeCompare(b)))).digest('hex'),data};
 };
 for(let round=0;round<3;round++){
  const startedAt=new Date().toISOString();let reads;
  if(round===1){const settled=await Promise.allSettled(targets.map(fetch));reads=settled.filter(r=>r.status==='fulfilled').map(r=>r.value);result.rounds.push({round:round+1,mode:'concurrent',startedAt,reads});const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
  else {reads=[];result.rounds.push({round:round+1,mode:round===0?'A→B':'B→A',startedAt,reads});for(const c of round===0?targets:[...targets].reverse())reads.push(await fetch(c));}
  accepted+=reads.length;console.log(JSON.stringify({round:round+1,ok:true,reads:reads.map(({container,elapsedMs})=>({container:container.name,elapsedMs}))}));
  if(round<2)await new Promise(resolve=>setTimeout(resolve,8000));
 }
 const all=result.rounds.flatMap(r=>r.reads);const fingerprints=targets.map(c=>new Set(all.filter(r=>r.container.id===c.id).map(r=>r.fingerprint)));
 result.checks={sixSuccessfulReads:accepted===6,eachContainerStable:fingerprints.every(s=>s.size===1),differentContainerResponses:[...fingerprints[0]].every(f=>!fingerprints[1].has(f)),singleBrowserInstance:all.every(r=>r.instanceId===listed.instanceId)};
 result.ok=Object.values(result.checks).every(Boolean);
}catch(error){result.ok=false;result.error={code:error.code||'PROBE_FAILED',message:'A round failed; no automatic retry was performed.'};}
finally{result.finishedAt=new Date().toISOString();fs.writeFileSync(evidence,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({ok:result.ok,evidence,checks:result.checks}));if(!result.ok)process.exitCode=1;}
