import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateWindowsRelease, windowsPackage, sha256 } from './windows-release-contract.mjs';
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
  const payload = path.join(output,'payload');fs.mkdirSync(payload);
  for (const [name,value] of [['package.json',windowsPackage(config)],['artifact.json',manifest]])fs.writeFileSync(path.join(payload,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  fs.copyFileSync(installer,path.join(payload,'EcomSetup.exe'),fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(sourceRoot,'LICENSE'),path.join(payload,'LICENSE'),fs.constants.COPYFILE_EXCL);
  const npm = path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  const packed = spawnSync(process.execPath,[npm,'pack','--ignore-scripts','--json','--pack-destination',output],{cwd:payload,encoding:'utf8'});
  if (packed.error || packed.status !== 0) throw packed.error || new Error(packed.stderr);
  const pack = JSON.parse(packed.stdout)[0];const tgz = path.join(output,pack.filename);
  if (fs.statSync(tgz).size>390000000 || pack.files.length!==4)throw new Error('Unexpected npm payload size or entries');
  const integrity='sha512-'+crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64');
  const run=(args)=>{const r=spawnSync(path.join(buildOutput,'EcomUpdater.exe'),args,{windowsHide:true,timeout:120000,encoding:'utf8'});if(r.error||r.status!==0)throw r.error||new Error('Windows updater verification failed');};
  run(['--self-test','--report',path.join(output,'updater-self-test.json')]);
  run(['--verify-payload',tgz,'--version',config.version,'--integrity',integrity,'--report',path.join(output,'verified-artifact.json')]);
  const receipt={...manifest,installer:path.basename(installer),tarball:pack.filename,tarballSha256:await sha256(tgz),integrity,tarballBytes:fs.statSync(tgz).size,
    buildEnvironment:{node:process.version,platform:process.platform,arch:process.arch,argsSha256:await sha256(path.join(buildOutput,'args_generated.gni'))},
    updaterSelfTest:true,payloadVerified:true,nativeSmokeTest:false,localUpdateRecoveryVerified:false,updateRoundTripVerified:false,rollbackRoundTripVerified:false,published:false};
  fs.writeFileSync(path.join(output,'release-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [sourceRoot,buildOutput,output]=process.argv.slice(2).map(p=>path.resolve(p));
  packageWindows({sourceRoot,buildOutput,output,sourceRevision:git(sourceRoot,['rev-parse','HEAD'])}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
