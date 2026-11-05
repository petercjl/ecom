// CI transfer and OIDC publication of one immutable Windows release and its parts.
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {spawnSync} from 'node:child_process';
import {sha256,validateWindowsParts} from './windows-release-contract.mjs';
import {verifyWindowsPayload,windowsRegistryStatus} from './verify-windows-payload.mjs';
const root=process.cwd(),[operation,version,tag]=process.argv.slice(2);
if(!['fetch','publish','ready'].includes(operation)||!['next','latest'].includes(tag)||!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid release operation');
const record=validateWindowsParts(JSON.parse(fs.readFileSync(path.join(root,'ecom/releases/windows-x64',version+'.json'))));
const directory=path.join(root,'windows-payloads'),mainName='petercjl-ecom-windows-x64-'+version+'.tgz';
async function waitForPublic(items){
  const deadline=Date.now()+15*60*1000;
  while(true){
    const results=await Promise.all(items.map(async item=>{
      const metadata=await windowsRegistryStatus(item.version,'next');if(!metadata)return false;
      if(metadata.dist.integrity!==item.integrity)throw new Error('Public immutable payload integrity differs: '+item.version);
      const url=new URL(metadata.dist.tarball);
      if(url.protocol!=='https:'||url.hostname!=='registry.npmjs.org'||url.username||url.password||url.port)throw new Error('Unsupported public payload origin');
      const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
      if(response.status===404){await response.arrayBuffer();return false;}
      if(!response.ok)throw new Error('Cannot read public payload file: '+item.version);
      // Metadata can precede blob availability at a registry edge. Read an
      // actual body chunk; complete downloads still verify the pinned hashes.
      const reader=response.body.getReader();
      try{const first=await reader.read();if(first.done||!first.value.length)throw new Error('Empty public payload file');}finally{await reader.cancel();}
      return true;
    }));
    if(results.every(Boolean))return;
    console.log('Waiting for npm processing: '+items.filter((_,i)=>!results[i]).map(p=>p.version).join(', '));
    if(Date.now()>=deadline)throw new Error('npm processing has not completed; retain exact versions and inspect before retrying');
    await new Promise(resolve=>setTimeout(resolve,10000));
  }
}
async function waitForTag(){
  const deadline=Date.now()+15*60*1000;
  while(true){
    const response=await fetch('https://registry.npmjs.org/@petercjl%2fecom-windows-x64/'+tag,{redirect:'error',signal:AbortSignal.timeout(30000)});
    if(response.ok){const metadata=await response.json();if(metadata.version===version){if(metadata.dist.integrity!==record.integrity)throw new Error('Public channel integrity differs');return;}}
    else {await response.arrayBuffer();if(response.status!==404)throw new Error('Cannot verify public channel');}
    if(Date.now()>=deadline)throw new Error('npm channel is not visible yet; inspect before retrying');
    console.log('Waiting for public npm channel: '+tag);await new Promise(resolve=>setTimeout(resolve,10000));
  }
}
async function download(url,file,limit,temporary=false){
  url=new URL(url);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='registry.npmjs.org'||temporary&&/^[a-z0-9-]+\.trycloudflare\.com$/.test(url.hostname)))throw new Error('Unsupported transfer origin');
  const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(1200000)});if(!r.ok||Number(r.headers.get('content-length'))>limit)throw new Error('Cannot transfer payload');
  let bytes=0;await pipeline(Readable.fromWeb(r.body),async function*(stream){for await(const chunk of stream){bytes+=chunk.length;if(bytes>limit)throw new Error('Payload too large');yield chunk;}},fs.createWriteStream(file,{flags:'wx'}));
}
if(operation==='ready'){
  await waitForPublic([...record.parts,record]);await waitForTag();console.log(JSON.stringify({ok:true,version,tag,parts:record.parts.length,allPublicIntegrityVerified:true}));
}else if(operation==='fetch'){
  if(fs.existsSync(directory))throw new Error('Transfer directory already exists');fs.mkdirSync(directory);
  const existing=await windowsRegistryStatus(version,tag);
  if(existing){
    if(existing.dist.integrity!==record.integrity)throw new Error('Published primary differs');
    await download(existing.dist.tarball,path.join(directory,mainName),70000000);fs.mkdirSync(path.join(directory,'parts'));
    for(const part of record.parts){const metadata=await windowsRegistryStatus(part.version,'next');if(!metadata||metadata.dist.integrity!==part.integrity)throw new Error('Published part differs');await download(metadata.dist.tarball,path.join(directory,'parts','petercjl-ecom-windows-x64-'+part.version+'.tgz'),70000000);}
  }else{
    const bundle=path.join(root,'windows-transfer.tar');await download(process.env.PAYLOAD_URL,bundle,390000000,true);
    if(fs.statSync(bundle).size!==record.transferBytes||await sha256(bundle)!==record.transferSha256)throw new Error('Transfer archive differs from pinned build');
    const run=args=>{const r=spawnSync('tar',args,{encoding:'utf8',maxBuffer:2000000});if(r.error||r.status!==0)throw new Error('Invalid transfer archive');return r.stdout.trim().split(/\r?\n/);};
    const expected=[mainName,...record.parts.map(p=>'parts/petercjl-ecom-windows-x64-'+p.version+'.tgz')].sort();
    if(JSON.stringify(run(['-tf',bundle]).sort())!==JSON.stringify(expected)||run(['-tvf',bundle]).some(line=>!line.startsWith('-')))throw new Error('Unexpected transfer entries');
    run(['-xf',bundle,'-C',directory]);
  }
  await verifyWindowsPayload(root,version,path.join(directory,mainName),tag);
}else{
  await verifyWindowsPayload(root,version,path.join(directory,mainName),tag);
  const npm=args=>{const r=spawnSync('npm',args,{stdio:'inherit',cwd:process.env.RUNNER_TEMP});if(r.error||r.status!==0)throw new Error('OIDC npm operation failed');};
  // Chunks are exact prerelease versions. The payload tag never changes latest.
  for(const part of record.parts){const existing=await windowsRegistryStatus(part.version,'next');if(existing){if(existing.dist.integrity!==part.integrity)throw new Error('Existing immutable part differs');}else npm(['publish',path.join(directory,'parts','petercjl-ecom-windows-x64-'+part.version+'.tgz'),'--access','public','--tag','payload']);}
  // npm can accept a publication before its asynchronous processing finishes.
  // Do not expose a primary version until every referenced part is public.
  await waitForPublic(record.parts);
  const existing=await windowsRegistryStatus(version,tag);
  if(existing){if(existing.dist.integrity!==record.integrity)throw new Error('Existing primary differs');npm(['dist-tag','add',record.packageName+'@'+version,tag]);}
  else npm(['publish',path.join(directory,mainName),'--access','public','--tag',tag]);
  await waitForPublic([record]);await waitForTag();
}
