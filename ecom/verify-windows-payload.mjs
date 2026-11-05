import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {validateWindowsRelease,windowsPackage,sha256} from './windows-release-contract.mjs';
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
  const verificationOnly=new Set(['AGENTS.md','ecom/verify-windows-payload.mjs','.github/workflows/ecom-windows-publish.yml']);
  const changes=git(root,['diff','--name-only',record.sourceRevision,'HEAD']).split('\n').filter(Boolean);
  if(changes.some(p=>!verificationOnly.has(p)&&!p.startsWith('docs/')&&!p.startsWith('ecom/releases/')&&!p.startsWith('packages/ecom-cli/')))throw new Error('Native inputs changed after the build');
  if(!tgz)return {ok:true,record};
  if(fs.statSync(tgz).size>390000000||await sha256(tgz)!==record.tarballSha256)throw new Error('Package checksum or size mismatch');
  const tar=args=>{const r=spawnSync('tar',args,{encoding:'utf8',maxBuffer:2000000});if(r.status!==0||r.error)throw new Error('Invalid tarball');return r.stdout;};
  const entries=tar(['-tzf',tgz]).trim().split('\n').sort();
  if(JSON.stringify(entries)!==JSON.stringify(['package/EcomSetup.exe','package/LICENSE','package/artifact.json','package/package.json'].sort()))throw new Error('Unexpected package entries');
  const pkg=JSON.parse(tar(['-xOzf',tgz,'package/package.json']));if(JSON.stringify(pkg)!==JSON.stringify(windowsPackage(config)))throw new Error('Unexpected npm package descriptor');
  const artifact=JSON.parse(tar(['-xOzf',tgz,'package/artifact.json']));
  for(const [k,v]of Object.entries(config))if(artifact[k]!==v)throw new Error('Artifact contract differs: '+k);
  for(const k of ['sourceRevision','archiveSha256','archiveBytes','exeSha256','frameworkSha256','updaterSha256'])if(artifact[k]!==record[k])throw new Error('Artifact identity differs: '+k);
  const hash=crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64');if('sha512-'+hash!==record.integrity)throw new Error('Recorded integrity mismatch');
  // The native Windows helper has already parsed the tar and checked the EXE;
  // this independent transport gate pins the entire packed payload.
  return {ok:true,record};
}
export async function windowsRegistryStatus(version,tag) {
  const r=await fetch('https://registry.npmjs.org/@petercjl%2fecom-windows-x64/'+encodeURIComponent(version),{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(r.status===404){if(tag==='latest')throw new Error('Publish and verify next first');return null;}
  if(!r.ok)throw new Error('Cannot query Windows registry version');const data=await r.json();
  if(data.name!=='@petercjl/ecom-windows-x64'||data.version!==version||!data.dist?.integrity)throw new Error('Unexpected registry identity');return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {positionals,values}=parseArgs({allowPositionals:true,options:{tag:{type:'string',default:'next'},registry:{type:'boolean'}}});
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const main=async()=>{const result=await verifyWindowsPayload(root,positionals[0],positionals[1],values.tag);if(values.registry){const data=await windowsRegistryStatus(positionals[0],values.tag);if(data&&data.dist.integrity!==result.record.integrity)throw new Error('Published payload differs from verified candidate');console.log('exists='+Boolean(data));}else console.log(JSON.stringify(result));};
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
}
