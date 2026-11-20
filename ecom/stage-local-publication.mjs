import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkLocalPayload} from './check-local-payload.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node ecom/stage-local-publication.mjs PAYLOAD_DIR NEW_LOCAL_RELEASE_ROOT');
const source=fs.realpathSync(input),target=path.resolve(output);
if(!source.startsWith(path.join(root,'.brave-build')+path.sep)||!target.startsWith(path.join(root,'.brave-build')+path.sep)||fs.existsSync(target))throw new Error('Use verified generated payload and a new local release root');
const result=await checkLocalPayload(source),pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json')));
fs.mkdirSync(target,{mode:0o700});
for(const name of ['package.json',...pkg.files])fs.linkSync(path.join(source,name),path.join(target,name));
fs.copyFileSync(path.join(root,'ecom/check-local-payload.mjs'),path.join(target,'release-check.mjs'),fs.constants.COPYFILE_EXCL);
fs.writeFileSync(path.join(target,'.npm-release-kit.json'),JSON.stringify({schemaVersion:1,mode:'local',checks:[['exec','--offline','--','node','release-check.mjs']]},null,2)+'\n',{flag:'wx',mode:0o600});
for(const args of [['init','-b','main'],['add','--intent-to-add','--','.']]){
  const r=spawnSync('git',args,{cwd:target,encoding:'utf8'});if(r.error||r.status!==0)throw r.error||new Error(r.stderr);
}
console.log(JSON.stringify({...result,source,root:target,binaryCopies:false}));
