import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {payloadPackage,validateRelease} from './release-contract.mjs';
import {windowsPackage,validateWindowsRelease} from './windows-release-contract.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [version,scope]=process.argv.slice(2);
if(!/^\d+\.\d+\.\d+$/.test(version)||!['petercjl','lumyne'].includes(scope))
  throw new Error('Usage: node ecom/set-release-version.mjs EXACT_VERSION petercjl|lumyne');
const entries=[['ecom/release-config.json','ecom/distribution/package.json','ecom-macos-arm64',validateRelease,payloadPackage],
  ['ecom/windows-release-config.json','ecom/distribution-windows/package.json','ecom-windows-x64',validateWindowsRelease,windowsPackage]];
const updates=[];
for(const [configFile,packageFile,name,validate,descriptor] of entries){
  const file=path.join(root,configFile),target=path.join(root,packageFile);
  for(const p of [file,target])if(!fs.lstatSync(p).isFile())throw new Error('Expected release descriptor');
  const config=validate({...JSON.parse(fs.readFileSync(file)),version,packageName:'@'+scope+'/'+name});
  updates.push([file,config],[target,descriptor(config)]);
}
const backup=fs.mkdtempSync(path.join(root,'.brave-build/release-config-'));
for(const [file] of updates){const to=path.join(backup,path.relative(root,file));fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(file,to,fs.constants.COPYFILE_EXCL);if(!fs.readFileSync(file).equals(fs.readFileSync(to)))throw new Error('Backup verification failed');}
for(const [file,value] of updates)fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({version,scope,backup,files:updates.map(([file])=>path.relative(root,file))}));
