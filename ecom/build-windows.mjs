import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {canonicalRepository,git,prepareWorkspace} from './workspace.mjs';
import {packageWindows} from './package-windows.mjs';
const root=canonicalRepository(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
export function windowsBuildEnvironment(environment,{exists=fs.existsSync,run=spawnSync}={}) {
  const env={...environment,DEPOT_TOOLS_WIN_TOOLCHAIN:'0',CL:[environment.CL,'/utf-8'].filter(Boolean).join(' ')};
  if(['2026','2022','2019','2017'].some(year=>env['vs'+year+'_install']))return env;
  const vswhere=path.win32.join(env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Microsoft Visual Studio','Installer','vswhere.exe');
  if(!exists(vswhere))throw new Error('Install Visual Studio C++ build tools or provide the supported vsYEAR_install hint');
  const result=run(vswhere,['-all','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-format','json','-utf8'],{encoding:'utf8'});
  if(result.error||result.status!==0)throw result.error||new Error('Cannot discover Visual Studio C++ build tools');
  const years={'18':'2026','17':'2022','16':'2019','15':'2017'};
  const normalize=value=>String(value).replaceAll('\\','/').replace(/\/+$/,'').toLowerCase();
  const installations=JSON.parse(result.stdout.replace(/^\uFEFF/,''));
  const found=installations.find(item=>years[String(item.installationVersion).split('.')[0]]&&exists(item.installationPath)&&
    (!env.GYP_MSVS_OVERRIDE_PATH||normalize(item.installationPath)===normalize(env.GYP_MSVS_OVERRIDE_PATH)));
  if(!found)throw new Error('No supported C++ toolchain matches the selected installation; provide vsYEAR_install explicitly');
  env['vs'+years[String(found.installationVersion).split('.')[0]]+'_install']=found.installationPath;
  env.GYP_MSVS_OVERRIDE_PATH ||= found.installationPath;
  return env;
}

function stageDev(buildOutput, run, buildRoot, revision) {
  const app = path.join(run, 'Ecom Dev');
  fs.mkdirSync(app);
  const required = ['Ecom.exe', 'chrome.dll', 'chrome_elf.dll', 'icudtl.dat',
    'resources.pak', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'locales'];
  const optional = ['brave_resources.pak', 'brave_100_percent.pak',
    'brave_200_percent.pak', 'v8_context_snapshot.bin', 'snapshot_blob.bin',
    'chrome_wer.dll', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll',
    'libEGL.dll', 'libGLESv2.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json',
    'vulkan-1.dll', 'IwaKeyDistribution', 'MEIPreload', 'hyphen-data'];
  for (const name of [...required, ...optional.filter(name => fs.existsSync(path.join(buildOutput, name)))]) {
    fs.cpSync(path.join(buildOutput, name), path.join(app, name), {
      recursive: true, force: false, errorOnExist: true,
    });
  }
  const executable = path.join(app, 'Ecom.exe');
  const profile = path.join(buildRoot, 'profiles', 'Ecom-Dev');
  const args = ['--ecom-dev', '--user-data-dir=' + profile];
  const launcher = path.join(run, 'Open Ecom Dev.cmd');
  fs.writeFileSync(launcher,
    '@echo off\r\nstart "" "%~dp0Ecom Dev\\Ecom.exe" --ecom-dev "--user-data-dir=' + profile + '" %*\r\n',
    {flag: 'wx'});
  const receipt = {channel: 'dev', sourceRevision: revision, executable, profile, args, launcher};
  fs.writeFileSync(path.join(run, 'dev-build.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  return receipt;
}
async function main() {
  if(process.argv.includes('--help')){console.log('node ecom/build-windows.mjs [--source-ref <committed revision>] [--with-installer | --dev]\nBuild the Windows x64 npm payload on peter-new. --dev stages a runnable copy and launcher for a separate Dev profile. Does not install or publish.');return;}
  if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Build Windows x64 on peter-new');
  if(!/^v24\./.test(process.version))throw new Error('Use the stable Node 24 toolchain');
  const {values}=parseArgs({options:{'source-ref':{type:'string'},'with-installer':{type:'boolean'},dev:{type:'boolean'}}});
  if(values.dev&&values['with-installer'])throw new Error('--dev and --with-installer are mutually exclusive');
  if(git(root,['branch','--show-current'])!=='main'||git(root,['status','--porcelain']))throw new Error('Use clean committed main');
  const revision=git(root,['rev-parse','--verify',(values['source-ref']||'HEAD')+'^{commit}']);
  const buildRoot=path.join(root,'.brave-build');
  const lock=path.join(buildRoot,'build-windows.lock');
  // A stale lock is preserved for inspection instead of silently starting a second build.
  const fd=fs.openSync(lock,'wx');
  try {
    const run=fs.mkdtempSync(path.join(buildRoot,values.dev?'windows-dev-':'windows-release-'));
    fs.writeFileSync(fd,JSON.stringify({pid:process.pid,sourceRevision:revision,run}));
    const workspace=path.join(buildRoot,'src/brave');prepareWorkspace(root,workspace,revision);
    const env=windowsBuildEnvironment(process.env);
    if (values.dev) os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
    const args=['build/commands/scripts/build.ts','Release','--target_os','win','--target_arch','x64','--channel','release','--skip_signing','--use_remoteexec','false','--gn','is_official_build:false','--gn','chrome_pgo_phase:0','--gn','use_thin_lto:false','--gn','enable_updater:false','--gn','ecom_source_revision:'+revision,'--target',values.dev?'brave':'brave,mini_installer'];
    const result=spawnSync(process.execPath,args,{cwd:workspace,env,stdio:'inherit'});
    if(result.error||result.status!==0)throw result.error||new Error('Native Windows build failed');
    const buildOutput=path.join(buildRoot,'src/out/Release');
    const receipt=values.dev?stageDev(buildOutput,run,buildRoot,revision):
      await packageWindows({sourceRoot:workspace,buildOutput,output:path.join(run,'artifacts'),sourceRevision:revision,withInstaller:values['with-installer']});
    console.log(JSON.stringify({ok:true,run,receipt}));
  } finally {fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error(e.stack);process.exitCode=1;});
