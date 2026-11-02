import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,pkg} from '../lib/common.mjs';

// Immutable registry tarballs are development fixtures, excluded from npm files.
const archives=JSON.parse(fs.readFileSync(path.join(root,'test/fixtures/npm/manifest.json')));
const npm=process.platform==='win32'?'npm.cmd':'npm';
const npmRun=(args,cwd)=>{
  const result=spawnSync(npm,args,{cwd,encoding:'utf8',shell:process.platform==='win32',timeout:60000,env:{...process.env,npm_config_dry_run:'false',npm_config_json:'false'}});
  assert.equal(result.status,0,result.stderr);return result.stdout;
};
const call=(entry,args,env)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[entry,...args],{env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  child.on('error',reject);child.on('close',(code,signal)=>{
    let result;try{result=JSON.parse(stdout);}catch{}
    resolve({code,signal,stdout,stderr,result});
  });
});

for(const archive of archives.versions)test(`published ${archive.version} updater: real npm handoff, partial-failure recovery, same-version and local-edits`,{timeout:120000},async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-archived-updater-'));
  let server;
  try {
    const file=path.join(root,'test/fixtures/npm',archive.file),bytes=fs.readFileSync(file);
    assert.equal('sha512-'+crypto.createHash('sha512').update(bytes).digest('base64'),archive.integrity);
    const candidate=path.join(tmp,'source');fs.mkdirSync(candidate);
    for(const name of ['package.json','capabilities.json','bin','lib','scripts','skills','README.md','INSTALL.md','UPDATE.md','LICENSE'])fs.cpSync(path.join(root,name),path.join(candidate,name),{recursive:true});
    const [major,minor,patch]=pkg.version.split('.').map(Number);
    const difference=pkg.version.split('.').map((n,i)=>Number(n)-Number(archive.version.split('.')[i])).find(n=>n!==0)??0;
    assert.ok(difference>=0,'Archive is newer than the candidate source');
    const version=difference===0?`${major}.${minor}.${patch+1}`:pkg.version;
    for(const name of ['package.json','capabilities.json','skills/ecom-cli/package.json']) {
      const file=path.join(candidate,name),data=JSON.parse(fs.readFileSync(file));data.version=version;fs.writeFileSync(file,JSON.stringify(data));
    }
    const packed=JSON.parse(npmRun(['pack','--json','--pack-destination',tmp],candidate))[0];
    const tarball=fs.readFileSync(path.join(tmp,packed.filename));
    server=http.createServer((req,res)=>{
      if(req.url==='/candidate.tgz'){res.end(tarball);return;}
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({name:pkg.name,'dist-tags':{latest:version},versions:{[version]:{name:pkg.name,version,dist:{tarball:`http://127.0.0.1:${server.address().port}/candidate.tgz`,integrity:packed.integrity}}}}));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const bootstrap=path.join(tmp,'bootstrap');npmRun(['install','--prefix',bootstrap,'--ignore-scripts','--no-audit','--no-fund',file],tmp);
    const old=path.join(bootstrap,'node_modules/@petercjl/ecom-cli/bin/ecom-cli.mjs');
    const env={...process.env,ECOM_CLI_STATE_DIR:path.join(tmp,'state'),ECOM_CLI_UPDATE_CHECK:'0',npm_config_registry:`http://127.0.0.1:${server.address().port}`};
    const invoke=async(entry,args,extra={})=>{
      const response=await call(entry,args,{...env,...extra});
      assert.ok(response.result,response.stderr||response.stdout);return response.result;
    };
    const options=target=>['--agent','archive-fixture','--target',target,'--json'];
    assert.equal((await invoke(old,['version','--json'])).version,archive.version);
    assert.equal((await invoke(old,['update','install','--agent','archive-fixture','--yes','--version',version,'--json'])).ok,false);
    const target=path.join(tmp,'host-a/ecom-cli'),other=path.join(tmp,'host-b/ecom-cli');
    for(const selected of [target,other])assert.equal((await invoke(old,['skill','install',...options(selected)])).current,true);
    const priorSkill=fs.readFileSync(path.join(target,'SKILL.md'));
    const otherReceipt=fs.readFileSync(path.join(other,'.ecom-receipt.json'));
    // Package acquisition succeeds, while activation is refused by a held lock.
    fs.writeFileSync(target+'.ecom-lock','fixture lock',{flag:'wx'});
    const failed=await invoke(old,['update','install',...options(target),'--yes','--version',version]);
    assert.equal(failed.ok,false);
    const directLegacyInstaller=['0.1.1','0.1.2'].includes(archive.version);
    assert.equal(failed.error.code,directLegacyInstaller?'TARGET_LOCKED':'CANDIDATE_ACTIVATION_FAILED');
    assert.equal((await invoke(path.join(target,'.runtime/bin/ecom-cli.mjs'),['version','--json'])).version,archive.version);
    const journals=fs.readdirSync(path.dirname(target)).filter(name=>name.startsWith(path.basename(target)+'.ecom-update-'));
    assert.equal(journals.length,1);
    const journal=JSON.parse(fs.readFileSync(path.join(path.dirname(target),journals[0])));
    const acquiredEntry=path.join(journal.candidate,'node_modules/@petercjl/ecom-cli/bin/ecom-cli.mjs');
    assert.equal((await invoke(acquiredEntry,['version','--json'])).version,version);
    fs.unlinkSync(target+'.ecom-lock');
    // A host may deny directory rename even after the maintenance lock clears.
    const renameInjector=path.join(tmp,'locked-directory.mjs');
    fs.writeFileSync(renameInjector,`import fs from 'node:fs';const original=fs.renameSync;fs.renameSync=function(from,to){if(from===process.env.ECOM_TEST_LOCK_TARGET){const error=new Error('fixture locked directory');error.code='EBUSY';throw error;}return original(from,to);};`,{flag:'wx'});
    const lockedDirectory=await invoke(acquiredEntry,['skill','update',...options(target)],{NODE_OPTIONS:`--import ${pathToFileURL(renameInjector).href}`,ECOM_TEST_LOCK_TARGET:target});
    assert.equal(lockedDirectory.ok,false);assert.equal(lockedDirectory.error.code,'EBUSY');
    assert.equal(lockedDirectory.error.recovery.activated,false);
    assert.deepEqual(fs.readFileSync(path.join(target,'SKILL.md')),priorSkill);
    assert.equal((await invoke(path.join(target,'.runtime/bin/ecom-cli.mjs'),['version','--json'])).version,archive.version);
    const repaired=await invoke(acquiredEntry,['skill','update',...options(target)]);
    assert.equal(repaired.current,true);
    assert.deepEqual(fs.readFileSync(path.join(repaired.backup,'SKILL.md')),priorSkill);
    // Exercise each archived implementation's successful update path as well.
    const roundtrip=path.join(tmp,'host-roundtrip/ecom-cli');
    assert.equal((await invoke(old,['skill','install',...options(roundtrip)])).current,true);
    const updated=await invoke(old,['update','install',...options(roundtrip),'--yes','--version',version]);
    assert.equal(updated.ok,true,JSON.stringify(updated));assert.ok(updated.backup);
    assert.deepEqual(fs.readFileSync(path.join(updated.backup,'SKILL.md')),priorSkill);
    assert.equal(JSON.parse(fs.readFileSync(path.join(updated.backup,'.runtime/package.json'))).version,archive.version);
    const entry=path.join(roundtrip,'.runtime/bin/ecom-cli.mjs');
    assert.equal((await invoke(entry,['version','--json'])).version,version);
    let status=await invoke(entry,['skill','status',...options(roundtrip)]);
    if(status.recovery?.required)status=await invoke(entry,['skill','update',...options(roundtrip)]);
    assert.equal(status.current,true);assert.equal(status.recovery?.required,false);
    const noop=await invoke(entry,['update','install',...options(roundtrip),'--yes','--version',version]);
    assert.equal(noop.current,true);assert.equal(noop.changed,false);
    assert.deepEqual(fs.readFileSync(path.join(other,'.ecom-receipt.json')),otherReceipt);
    fs.appendFileSync(path.join(other,'SKILL.md'),'\nfixture local edit\n');
    const protectedResult=await invoke(old,['update','install',...options(other),'--yes','--version',version]);
    assert.equal(protectedResult.ok,false);assert.equal(protectedResult.error.code,'LOCAL_EDITS');
    assert.match(fs.readFileSync(path.join(other,'SKILL.md'),'utf8'),/fixture local edit/);

    if(!directLegacyInstaller) {
      const unknown=path.join(tmp,'host-unknown/ecom-cli');
      assert.equal((await invoke(old,['skill','install',...options(unknown)])).current,true);
      // Simulate losing the immutable old parent after its real installer
      // handoff completes, before it can return an activation result.
      const injector=path.join(tmp,'interrupt-after-handoff.mjs');
      fs.writeFileSync(injector,`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const original=cp.spawnSync;cp.spawnSync=function(command,args,options){const result=original(command,args,options);if(args?.includes('skill')&&args?.includes('update'))process.kill(process.pid,'SIGKILL');return result;};syncBuiltinESMExports();`,{flag:'wx'});
      const interrupted=await call(old,['update','install',...options(unknown),'--yes','--version',version],{...env,NODE_OPTIONS:`--import ${pathToFileURL(injector).href}`});
      assert.notEqual(interrupted.code,0);assert.equal(interrupted.result,undefined);
      const recovered=path.join(unknown,'.runtime/bin/ecom-cli.mjs');
      assert.equal((await invoke(recovered,['version','--json'])).version,version);
      assert.equal((await invoke(recovered,['skill','status',...options(unknown)])).current,true);
    }
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});
