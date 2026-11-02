import fs from 'node:fs';
import path from 'node:path';
import {root,pkg,fail} from './common.mjs';
import {discover,listContainers} from './browser.mjs';
import {source,status,installSkill,checkUpdate,updateInstall} from './maintenance.mjs';
export const capabilities=()=>JSON.parse(fs.readFileSync(path.join(root,'capabilities.json'),'utf8'));
export function parse(argv) {
  const positions=[],options={}, caps=capabilities();
  for(let i=0;i<argv.length;i++) {
    const word=argv[i];
    if(!word.startsWith('--')) {positions.push(word);continue;}
    if(word==='--version'&&argv.length===1){positions.push('version');continue;}
    const key=word.slice(2);
    if(Object.hasOwn(options,key)) throw fail('INVALID_ARGUMENT','Duplicate option '+word);
    if(['json','help','yes'].includes(key))options[key]=true;
    else if(['agent','target','profile','instance','name','version'].includes(key)&&argv[i+1]&&!argv[i+1].startsWith('--')) options[key]=argv[++i];
    else throw fail('INVALID_ARGUMENT','Unknown option or missing value: '+word);
  }
  let command=positions.join(' ')||'help';
  const requested=command;
  if(options.help) command='help';
  if(!caps.commandContracts[command]) throw fail('INVALID_ARGUMENT','Unsupported command; use help --json');
  if(command!=='help')for(const key of Object.keys(options))if(!caps.commandContracts[command].options['--'+key])throw fail('INVALID_ARGUMENT','Option is not supported by this command: --'+key);
  if(options.name&&options.name!=='ecom-cli')throw fail('INVALID_ARGUMENT','Unknown Skill name');
  return {command,options,requested};
}
export async function main(argv) {
  const {command,options,requested}=parse(argv);
  if(command==='help')return {ok:true,package:pkg.name,version:pkg.version,usage:'ecom-cli containers list --json | skill source|status|install|update | update check|install | doctor',...capabilities(),...(capabilities().commandContracts[requested]??{})};
  if(command==='version')return {ok:true,package:pkg.name,version:pkg.version,protocolVersion:1};
  if(command==='capabilities'||command==='schema')return {ok:true,...capabilities()};
  if(command==='skill source') {const item=source();return {...item,complete:true,items:[item]};}
  if(command==='skill status')return status(options);
  if(command==='skill install'||command==='skill update')return installSkill(options);
  if(command==='update check')return checkUpdate();
  if(command==='update install')return updateInstall(options);
  if(command==='doctor') {
    let instance,error;try{const found=discover(options);instance={id:found.endpoint.instanceId,pid:found.endpoint.pid,channel:found.channel};}catch(e){error={code:e.code,message:e.message};}
    return {ok:!error,package:pkg.name,version:pkg.version,node:process.version,platform:process.platform,transport:'private-local-mailbox',debuggingRequired:false,instance,...(error?{error}:{}),skillSource:source().path};
  }
  if(command==='containers list') {
    const update=await checkUpdate({automatic:true});
    if(update.available)process.stderr.write('Ecom CLI update available: '+update.latest+'; ask the current Agent to update the package and Skill.\n');
    return listContainers(options);
  }
}
