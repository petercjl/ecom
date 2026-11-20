import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export async function checkLocalPayload(directory) {
  const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name)));
  const pkg=read('package.json');
  if(!/^@(petercjl|lumyne)\/ecom-(macos-arm64|windows-x64)$/.test(pkg.name)||
     !/^\d+\.\d+\.\d+(?:-payload\.[0-7])?$/.test(pkg.version)||pkg.scripts||pkg.dependencies)
    throw new Error('Unexpected native payload identity');
  const mac=pkg.name.endsWith('macos-arm64'),part=pkg.version.includes('-payload.');
  const expected=mac?['Ecom.tar.xz','artifact.json','LICENSE']:part?['EcomSetup.part','part.json','LICENSE']:['artifact.json','LICENSE'];
  if(JSON.stringify(pkg.files)!==JSON.stringify(expected)||pkg.publishConfig?.access!=='public'||
     JSON.stringify(pkg.os)!==JSON.stringify([mac?'darwin':'win32'])||
     JSON.stringify(pkg.cpu)!==JSON.stringify([mac?'arm64':'x64']))throw new Error('Unexpected native package contract');
  for(const name of ['package.json',...expected]){
    const s=fs.lstatSync(path.join(directory,name));if(!s.isFile()||s.size<=0)throw new Error('Missing regular payload file');
  }
  const manifest=read(part?'part.json':'artifact.json');
  if(part){
    if(pkg.version!==manifest.version+'-payload.'+manifest.index||manifest.schemaVersion!==1)throw new Error('Part identity differs');
  }else if(manifest.packageName!==pkg.name||manifest.version!==pkg.version||manifest.schemaVersion!==1||manifest.updateProtocol!==1||manifest.channel!=='latest'||manifest.platform!==(mac?'darwin':'win32')||manifest.arch!==(mac?'arm64':'x64'))throw new Error('Manifest identity differs');
  if(mac||part){
    const file=path.join(directory,mac?'Ecom.tar.xz':'EcomSetup.part');
    const hash=crypto.createHash('sha256');for await(const data of fs.createReadStream(file))hash.update(data);
    if(fs.statSync(file).size!==(mac?manifest.archiveBytes:manifest.bytes)||hash.digest('hex')!==(mac?manifest.archiveSha256:manifest.sha256))throw new Error('Payload content differs');
  }else if(manifest.payloadFormat!=='npm-parts-v1'||!Array.isArray(manifest.parts)||!manifest.parts.length||manifest.parts.some((p,i)=>p.index!==i||p.version!==pkg.version+'-payload.'+i))throw new Error('Invalid Windows payload layout');
  return {ok:true,package:pkg.name,version:pkg.version};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  checkLocalPayload(process.cwd()).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});
