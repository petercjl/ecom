import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateWindowsRelease, windowsPackage, windowsPartPackage, windowsPartBytes, windowsPackBudget, validateWindowsParts, sha256 } from './windows-release-contract.mjs';
import { git } from './workspace.mjs';

export async function packageWindows({sourceRoot, buildOutput, output, sourceRevision}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Package Windows x64 on the Windows build machine');
  const config = validateWindowsRelease(JSON.parse(fs.readFileSync(path.join(sourceRoot, 'ecom/windows-release-config.json'))));
  if (git(sourceRoot, ['rev-parse', 'HEAD']) !== sourceRevision || git(sourceRoot, ['status', '--porcelain'])) throw new Error('Native source must match the clean committed build');
  if (fs.existsSync(output)) throw new Error('Output already exists');
  fs.mkdirSync(output, {recursive:true});
  const native = JSON.parse(fs.readFileSync(path.join(buildOutput, 'ecom-update.json')));
  if (native.sourceRevision !== sourceRevision || native.version !== config.version) throw new Error('Build metadata differs from selected source');
  const source = path.join(buildOutput, 'mini_installer.exe');
  const installer = path.join(output, `Ecom-${config.version}-windows-x64.exe`);
  fs.copyFileSync(source, installer, fs.constants.COPYFILE_EXCL);
  const manifest = {...config, sourceRevision, archive:'EcomSetup.exe', archiveSha256:await sha256(installer), archiveBytes:fs.statSync(installer).size,
    exeSha256:await sha256(path.join(buildOutput,'Ecom.exe')), frameworkSha256:await sha256(path.join(buildOutput,'chrome.dll')), updaterSha256:await sha256(path.join(buildOutput,'EcomUpdater.exe'))};
  const npm = path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  const partsDirectory=path.join(output,'parts');fs.mkdirSync(partsDirectory);
  const write=(directory,name,value)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  const packAt=(directory,destination,count)=>{
    fs.copyFileSync(path.join(sourceRoot,'LICENSE'),path.join(directory,'LICENSE'),fs.constants.COPYFILE_EXCL);
    const result=spawnSync(process.execPath,[npm,'pack','--ignore-scripts','--json','--pack-destination',destination],{cwd:directory,encoding:'utf8'});
    if(result.error||result.status!==0)throw result.error||new Error(result.stderr);
    const value=JSON.parse(result.stdout)[0];
    if(value.files.length!==count||fs.statSync(path.join(destination,value.filename)).size>windowsPackBudget)throw new Error('Windows npm pack exceeds publication budget');return value;
  };
  manifest.payloadFormat='npm-parts-v1';manifest.parts=[];
  const input=fs.openSync(installer,'r');
  try {
    for(let offset=0,index=0;offset<manifest.archiveBytes;offset+=windowsPartBytes,index++){
      const directory=path.join(output,'part-'+index);fs.mkdirSync(directory);
      const bytes=Math.min(windowsPartBytes,manifest.archiveBytes-offset),buffer=Buffer.alloc(bytes);
      if(fs.readSync(input,buffer,0,bytes,offset)!==bytes)throw new Error('Truncated source installer');
      const part={index,version:config.version+'-payload.'+index,bytes,sha256:crypto.createHash('sha256').update(buffer).digest('hex')};
      fs.writeFileSync(path.join(directory,'EcomSetup.part'),buffer,{flag:'wx'});
      write(directory,'part.json',{schemaVersion:1,version:config.version,index,bytes,sha256:part.sha256});write(directory,'package.json',windowsPartPackage(config,index));
      const packed=packAt(directory,partsDirectory,4),file=path.join(partsDirectory,packed.filename);
      manifest.parts.push({...part,tarballBytes:fs.statSync(file).size,tarballSha256:await sha256(file),integrity:'sha512-'+crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64')});
    }
  }finally{fs.closeSync(input);}
  validateWindowsParts(manifest);
  const payload=path.join(output,'payload');fs.mkdirSync(payload);
  write(payload,'package.json',windowsPackage(config));write(payload,'artifact.json',manifest);
  const pack=packAt(payload,output,3),tgz=path.join(output,pack.filename);
  const integrity='sha512-'+crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64');
  const run=(args)=>{const r=spawnSync(path.join(buildOutput,'EcomUpdater.exe'),args,{windowsHide:true,timeout:120000,encoding:'utf8'});if(r.error||r.status!==0)throw r.error||new Error('Windows updater verification failed');};
  run(['--self-test','--report',path.join(output,'updater-self-test.json')]);
  run(['--verify-payload',tgz,'--parts-dir',partsDirectory,'--version',config.version,'--integrity',integrity,'--report',path.join(output,'verified-artifact.json')]);
  const corrupt=path.join(output,'corrupt-parts');fs.mkdirSync(corrupt);
  const first='petercjl-ecom-windows-x64-'+manifest.parts[0].version+'.tgz';fs.copyFileSync(path.join(partsDirectory,first),path.join(corrupt,first),fs.constants.COPYFILE_EXCL);fs.appendFileSync(path.join(corrupt,first),'corrupt');
  const rejected=spawnSync(path.join(buildOutput,'EcomUpdater.exe'),['--verify-payload',tgz,'--parts-dir',corrupt,'--version',config.version,'--integrity',integrity,'--report',path.join(output,'unexpected-corrupt-report.json')],{windowsHide:true,timeout:120000,encoding:'utf8'});
  if(rejected.error||rejected.status!==1||fs.existsSync(path.join(output,'unexpected-corrupt-report.json')))throw new Error('Corrupt payload part was not rejected');
  const transfer=path.join(output,'windows-transfer.tar');
  const transferFiles=[pack.filename,...manifest.parts.map(p=>'parts/petercjl-ecom-windows-x64-'+p.version+'.tgz')];
  const bundled=spawnSync('tar',['-cf',transfer,'-C',output,...transferFiles],{encoding:'utf8'});if(bundled.error||bundled.status!==0)throw bundled.error||new Error(bundled.stderr);
  const receipt={...manifest,installer:path.basename(installer),tarball:pack.filename,tarballSha256:await sha256(tgz),integrity,tarballBytes:fs.statSync(tgz).size,transfer:path.basename(transfer),transferSha256:await sha256(transfer),transferBytes:fs.statSync(transfer).size,
    buildEnvironment:{node:process.version,platform:process.platform,arch:process.arch,argsSha256:await sha256(path.join(buildOutput,'args_generated.gni'))},
    updaterSelfTest:true,payloadVerified:true,corruptedPartRejected:true,nativeSmokeTest:false,localUpdateRecoveryVerified:false,updateRoundTripVerified:false,rollbackRoundTripVerified:false,published:false};
  fs.writeFileSync(path.join(output,'release-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [sourceRoot,buildOutput,output]=process.argv.slice(2).map(p=>path.resolve(p));
  packageWindows({sourceRoot,buildOutput,output,sourceRevision:git(sourceRoot,['rev-parse','HEAD'])}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
