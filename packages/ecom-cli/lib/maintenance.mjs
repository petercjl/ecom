import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {root,pkg,fail,exists,tree,writeNew} from './common.mjs';
const receiptName='.ecom-receipt.json';
export const source=(base=root)=>({ok:true,name:'ecom-cli',package:pkg.name,version:JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8')).version,path:path.join(base,'skills/ecom-cli'),provenance:{ownership:'npm-package',registryContentVerified:false}});
export function targetOf(options) {
  if(!options.agent || !/^[a-z][a-z0-9-]{0,63}$/.test(options.agent)) throw fail('INVALID_ARGUMENT','Supply a valid --agent name; unnamed hosts use the generic adapter');
  if(!options.target || !path.isAbsolute(options.target)) throw fail('TARGET_REQUIRED','Current Agent must resolve and supply an absolute --target Skill directory');
  const target=path.resolve(options.target);
  for(let p=target;p!==path.dirname(p);p=path.dirname(p)) if(exists(p)&&fs.lstatSync(p).isSymbolicLink()) {
    const systemAlias=process.platform==='darwin'&&['/var','/tmp'].includes(p)&&fs.lstatSync(p).uid===0;
    if(!systemAlias)throw fail('UNSAFE_PATH','Skill destination must use physical directories');
  }
  const ownTarget=path.basename(root)==='.runtime'&&path.dirname(root)===target;
  if(!ownTarget&&(target===root || root.startsWith(target+path.sep) || target.startsWith(root+path.sep))) throw fail('TARGET_CONFLICT','Skill target must be independent of the package source');
  return target;
}
export function status(options,base=root) {
  const target=targetOf(options), meta=path.join(target,receiptName), installed=exists(target);
  let receipt;try{if(exists(meta)&&fs.lstatSync(meta).isFile()) receipt=JSON.parse(fs.readFileSync(meta,'utf8'));}catch{}
  const managed=receipt?.package===pkg.name && receipt?.target===target && receipt?.agent===options.agent;
  const files=installed?tree(target):{}, old=managed?receipt.files:{}, edited=managed && JSON.stringify(files)!==JSON.stringify(old);
  const identity=source(base), canonical=tree(identity.path);
  const canonicalCurrent=managed && Object.entries(canonical).every(([name,hash])=>files[name]===hash) && Object.keys(files).filter(n=>!n.startsWith('.runtime/')).length===Object.keys(canonical).length;
  let runtimeVersion;try{runtimeVersion=JSON.parse(fs.readFileSync(path.join(target,'.runtime/package.json'),'utf8')).version;}catch{}
  const current=!!(managed&&!edited&&canonicalCurrent&&runtimeVersion===identity.version&&receipt.version===identity.version);
  return {...identity,target,installed,managed,current,edited:!!edited,adapter:'generic',agent:options.agent,entry:path.join(target,'.runtime/bin/ecom-cli.mjs'),verification:{verified:current,algorithm:'sha256'},recovery:{required:installed&&!current,action:edited?'Preserve local edits; reconcile them before update':'Run skill update for this exact target'},hostDiscovery:{authority:'host',verified:false},...(managed?{installedVersion:receipt.version,backup:receipt.backup??null}:{})};
}
export function installSkill(options,base=root) {
  const before=status(options,base), target=before.target;
  if(before.current) return {...before,changed:false};
  if(before.installed&&!before.managed) throw fail('UNMANAGED_TARGET','Existing Skill is user-owned; choose a fresh destination');
  if(before.edited) throw fail('LOCAL_EDITS','Managed Skill has local edits; preserve and reconcile them before update');
  const parent=path.dirname(target);fs.mkdirSync(parent,{recursive:true});
  const lock=target+'.ecom-lock';let fd;
  try {fd=fs.openSync(lock,'wx',0o600);}catch{throw fail('TARGET_LOCKED','Another maintenance operation holds the target lock');}
  const operationId=crypto.randomUUID(), staging=target+'.ecom-stage-'+operationId;
  const backup=before.installed?target+'.ecom-backup-'+operationId:null;
  let activated=false;
  try {
    tree(base);
    fs.cpSync(source(base).path,staging,{recursive:true,errorOnExist:true,force:false});
    const runtime=path.join(staging,'.runtime');fs.mkdirSync(runtime);
    for(const name of ['package.json','capabilities.json','bin','lib','scripts','skills','README.md','INSTALL.md','UPDATE.md','LICENSE']) {
      fs.cpSync(path.join(base,name),path.join(runtime,name),{recursive:true,errorOnExist:true,force:false});
    }
    const manifest=source(base);
    writeNew(path.join(staging,receiptName),{schemaVersion:1,package:pkg.name,name:'ecom-cli',version:manifest.version,target,agent:options.agent,operationId,backup,files:tree(staging)});
    // Recheck edits after staging, before replacement.
    const again=status(options,base);
    if(again.edited || again.installed!==before.installed) throw fail('TARGET_CHANGED','Skill changed during preparation');
    if(backup) fs.renameSync(target,backup);
    try {fs.renameSync(staging,target);activated=true;}catch(e){if(backup&&!exists(target))fs.renameSync(backup,target);throw e;}
    const result=status(options,base);
    if(!result.current) throw fail('VERIFY_FAILED','Installation integrity verification failed');
    return {...result,changed:true,operationId,backup,completion:{cli:true,skill:true,hostDiscovery:false},remainingActions:['Load installed SKILL.md through the current Agent discovery mechanism']};
  } catch(e) {
    if(!activated&&exists(staging)) fs.rmSync(staging,{recursive:true});
    throw fail(e.code||'INSTALL_FAILED',e.code?e.message:'Skill activation failed; the previous installation is preserved',{operationId,recovery:{backup,target,activated,action:'Inspect skill status before retrying'}});
  } finally {fs.closeSync(fd);fs.unlinkSync(lock);}
}
const cacheRoot=()=>path.join(os.homedir(),'.cache','ecom-cli');
export async function checkUpdate({automatic=false}={}) {
  if(automatic&&process.env.ECOM_CLI_UPDATE_CHECK==='0') return {ok:true,disabled:true};
  const cache=path.join(cacheRoot(),'update.json');
  let old;try {old=JSON.parse(fs.readFileSync(cache,'utf8'));}catch{}
  if(automatic&&old?.version===pkg.version&&Date.now()-old.checkedAt<86400000) return {...old,cached:true};
  let result;
  try {
    const response=await fetch('https://registry.npmjs.org/@petercjl%2fecom-cli/latest',{signal:AbortSignal.timeout(1500)});
    if(!response.ok) throw Error('registry');
    const data=await response.json();if(data.name!==pkg.name||!/^\d+\.\d+\.\d+$/.test(data.version))throw Error('shape');
    result={ok:true,version:pkg.version,latest:data.version,available:data.version!==pkg.version,checkedAt:Date.now(),channel:'latest'};
  }catch{result={ok:false,code:'REGISTRY_UNAVAILABLE',version:pkg.version,checkedAt:Date.now(),retained:true};}
  if(automatic) {
    try {fs.mkdirSync(cacheRoot(),{recursive:true,mode:0o700});if(!exists(cache))writeNew(cache,result);else {const archive=cache+'.previous-'+crypto.randomUUID();fs.renameSync(cache,archive);writeNew(cache,result);}}catch{/* Detection must not block read-only work. */}
  }
  return result;
}
export async function updateInstall(options) {
  const before=status(options);
  if(before.installed&&(!before.managed||before.edited)) throw fail('LOCAL_EDITS','Resolve target ownership and edits before updating');
  if(!options.yes) throw fail('CONFIRMATION_REQUIRED','Explicit update authorization requires --yes');
  const selected=options.version??(await checkUpdate()).latest;
  if(!/^\d+\.\d+\.\d+$/.test(selected??'')) throw fail('REGISTRY_UNAVAILABLE','Cannot resolve a stable version; installed components retained');
  if(selected===pkg.version) return installSkill(options);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-cli-candidate-'));
  const operationId=crypto.randomUUID();
  const journal=options.target+'.ecom-update-'+operationId+'.json';
  fs.mkdirSync(path.dirname(journal),{recursive:true});
  writeNew(journal,{operationId,target:before.target,previousVersion:pkg.version,candidateVersion:selected,stage:'acquisition',candidate:directory});
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  const acquired=spawnSync(npm,['install','--prefix',directory,'--ignore-scripts','--no-audit','--no-fund',pkg.name+'@'+selected],{encoding:'utf8',timeout:120000,shell:process.platform==='win32',env:{...process.env,npm_config_dry_run:'false',npm_config_json:'false'}});
  if(acquired.status!==0) throw fail('PACKAGE_ACQUISITION_FAILED','Candidate installation failed; existing runtime and Skill retained',{operationId,recovery:{journal,stage:'acquisition',action:'Inspect candidate and operation record before retrying'}});
  const candidate=path.join(directory,'node_modules/@petercjl/ecom-cli');
  if(source(candidate).version!==selected) throw fail('VERSION_MISMATCH','Acquired candidate version differs from requested version',{operationId,recovery:{journal}});
  const result=installSkill(options,candidate);
  return {...result,operationId,journal,selectedVersion:selected,bootstrapRetained:true,activation:'Use the entry in this receipt; the selected Skill contains its own CLI runtime'};
}
