import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {canonicalRepository,git,prepareWorkspace} from './workspace.mjs';
import {packageWindows} from './package-windows.mjs';
const root=canonicalRepository(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
async function main() {
  if(process.argv.includes('--help')){console.log('node ecom/build-windows.mjs [--source-ref <committed seed revision>]\nBuild and package Windows x64 on peter-new. Does not install or publish.');return;}
  if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Build Windows x64 on peter-new');
  if(!/^v24\./.test(process.version))throw new Error('Use the stable Node 24 toolchain');
  const {values}=parseArgs({options:{'source-ref':{type:'string'}}});
  if(git(root,['branch','--show-current'])!=='main'||git(root,['status','--porcelain']))throw new Error('Use clean committed main');
  const revision=git(root,['rev-parse','--verify',(values['source-ref']||'HEAD')+'^{commit}']);
  const buildRoot=path.join(root,'.brave-build'), run=fs.mkdtempSync(path.join(buildRoot,'windows-release-'));
  const lock=path.join(buildRoot,'build-windows.lock');
  // A stale lock is preserved for inspection instead of silently starting a second build.
  const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,sourceRevision:revision,run}));fs.closeSync(fd);
  try {
    const workspace=path.join(buildRoot,'src/brave');prepareWorkspace(root,workspace,revision);
    const env={...process.env,DEPOT_TOOLS_WIN_TOOLCHAIN:'0',CL:'/utf-8'};
    const args=['build/commands/scripts/build.ts','Release','--target_os','win','--target_arch','x64','--channel','release','--skip_signing','--use_remoteexec','false','--gn','is_official_build:false','--gn','chrome_pgo_phase:0','--gn','use_thin_lto:false','--gn','enable_updater:false','--gn','ecom_source_revision:'+revision,'--target','brave,mini_installer'];
    const result=spawnSync(process.execPath,args,{cwd:workspace,env,stdio:'inherit'});
    if(result.error||result.status!==0)throw result.error||new Error('Native Windows build failed');
    const receipt=await packageWindows({sourceRoot:workspace,buildOutput:path.join(buildRoot,'src/out/Release'),output:path.join(run,'artifacts'),sourceRevision:revision});
    console.log(JSON.stringify({ok:true,run,receipt}));
  } finally {fs.unlinkSync(lock);}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
