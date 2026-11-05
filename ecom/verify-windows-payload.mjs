import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {validateWindowsRelease,windowsPackage,windowsPartPackage,validateWindowsParts,windowsPackBudget,sha256} from './windows-release-contract.mjs';
import {git} from './workspace.mjs';

export function validateWindowsPublication(record,config,tag) {
  validateWindowsRelease(config);
  if(!['next','latest'].includes(tag)||record.version!==config.version||record.packageName!==config.packageName||record.platform!=='win32'||record.arch!=='x64'||
    record.nativeSmokeTest!==true||record.localUpdateRecoveryVerified!==true||record.updaterSelfTest!==true||record.payloadVerified!==true||
    (tag==='latest'&&(record.updateRoundTripVerified!==true||record.rollbackRoundTripVerified!==true))||
    !/^[a-f0-9]{40}$/.test(record.sourceRevision)||!/^[a-f0-9]{64}$/.test(record.tarballSha256)||
    !/^docs\/ecom\/release-evidence\/[a-zA-Z0-9._-]+\.md$/.test(record.evidencePath))throw new Error('Windows native release evidence is incomplete');
  return record;
}
export async function verifyWindowsPayload(root,version,tgz,tag='next') {
  const config=validateWindowsRelease(JSON.parse(fs.readFileSync(path.join(root,'ecom/windows-release-config.json'))));
  if(version!==config.version)throw new Error('Version must match the committed Windows release');
  if(JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'ecom/distribution-windows/package.json'))))!==JSON.stringify(windowsPackage(config)))throw new Error('Distribution descriptor mismatch');
  const record=validateWindowsPublication(JSON.parse(fs.readFileSync(path.join(root,'ecom/releases/windows-x64',version+'.json'))),config,tag);
  git(root,['cat-file','-e',record.sourceRevision+'^{commit}']);
  const evidence=git(root,['show','HEAD:'+record.evidencePath]);if(!evidence.includes(record.sourceRevision))throw new Error('Build source missing from evidence');
  const verificationOnly=new Set(['AGENTS.md','ecom/verify-windows-payload.mjs','.github/workflows/ecom-windows-publish.yml','ecom/tests/windows-updater-local-roundtrip.cs','ecom/windows-release-transfer.mjs']);
  const changes=git(root,['diff','--name-only',record.sourceRevision,'HEAD']).split(/\r?\n/).filter(Boolean);
  if(changes.some(p=>!verificationOnly.has(p)&&!p.startsWith('docs/')&&!p.startsWith('ecom/releases/')&&!p.startsWith('packages/ecom-cli/')))throw new Error('Native inputs changed after the build');
  validateWindowsParts(record);
  if(!tgz)return {ok:true,record};
  const checkArchive=async(file,identity,entries)=>{
    if(fs.statSync(file).size!==identity.tarballBytes||fs.statSync(file).size>windowsPackBudget||await sha256(file)!==identity.tarballSha256)throw new Error('Package checksum or size mismatch');
    const integrity='sha512-'+crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');if(integrity!==identity.integrity)throw new Error('Recorded integrity mismatch');
    const tar=(args,binary=false)=>{const r=spawnSync('tar',args,{encoding:binary?null:'utf8',maxBuffer:55_000_000});if(r.status!==0||r.error)throw new Error('Invalid tarball');return r.stdout;};
    const names=tar(['-tzf',file]).trim().split(/\r?\n/).sort();
    if(JSON.stringify(names)!==JSON.stringify(entries.sort()))throw new Error('Unexpected package entries');
    if(tar(['-tvzf',file]).trim().split(/\r?\n/).some(line=>!line.startsWith('-')))throw new Error('Archive links rejected');
    return (name,binary=false)=>tar(['-xOzf',file,'package/'+name],binary);
  };
  const main=await checkArchive(tgz,record,['package/artifact.json','package/package.json','package/LICENSE']);
  if(JSON.stringify(JSON.parse(main('package.json')))!==JSON.stringify(windowsPackage(config)))throw new Error('Unexpected npm package descriptor');
  const artifact=validateWindowsParts(JSON.parse(main('artifact.json')));
  for(const [k,v]of Object.entries(config))if(artifact[k]!==v)throw new Error('Artifact contract differs: '+k);
  for(const k of ['sourceRevision','archiveSha256','archiveBytes','exeSha256','frameworkSha256','updaterSha256','payloadFormat','parts'])if(JSON.stringify(artifact[k])!==JSON.stringify(record[k]))throw new Error('Artifact identity differs: '+k);
  const installerHash=crypto.createHash('sha256');
  for(const part of artifact.parts){
    const file=path.join(path.dirname(tgz),'parts','petercjl-ecom-windows-x64-'+part.version+'.tgz');
    const read=await checkArchive(file,part,['package/EcomSetup.part','package/part.json','package/package.json','package/LICENSE']);
    if(JSON.stringify(JSON.parse(read('package.json')))!==JSON.stringify(windowsPartPackage(config,part.index)))throw new Error('Part descriptor mismatch');
    const info=JSON.parse(read('part.json')),bytes=read('EcomSetup.part',true);
    if(info.schemaVersion!==1||info.version!==config.version||info.index!==part.index||info.bytes!==part.bytes||info.sha256!==part.sha256||bytes.length!==part.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==part.sha256)throw new Error('Payload part mismatch');
    installerHash.update(bytes);
  }
  if(installerHash.digest('hex')!==record.archiveSha256)throw new Error('Reassembled installer differs');
  return {ok:true,record};
}
export async function windowsRegistryStatus(version,tag) {
  const r=await fetch('https://registry.npmjs.org/@petercjl%2fecom-windows-x64/'+encodeURIComponent(version),{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(r.status===404){await r.arrayBuffer();if(tag==='latest')throw new Error('Publish and verify next first');return null;}
  if(!r.ok)throw new Error('Cannot query Windows registry version');const data=await r.json();
  if(data.name!=='@petercjl/ecom-windows-x64'||data.version!==version||!data.dist?.integrity)throw new Error('Unexpected registry identity');return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {positionals,values}=parseArgs({allowPositionals:true,options:{tag:{type:'string',default:'next'},registry:{type:'boolean'}}});
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const main=async()=>{const result=await verifyWindowsPayload(root,positionals[0],positionals[1],values.tag);if(values.registry){const data=await windowsRegistryStatus(positionals[0],values.tag);if(data&&data.dist.integrity!==result.record.integrity)throw new Error('Published payload differs from verified candidate');console.log('exists='+Boolean(data));}else console.log(JSON.stringify(result));};
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
}
