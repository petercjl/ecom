import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import http from 'node:http';
import {root,pkg} from '../lib/common.mjs';
import {parse} from '../lib/cli.mjs';
import {checkUpdate} from '../lib/maintenance.mjs';
const npm=process.platform==='win32'?'npm.cmd':'npm';
const invoke=(entry,args)=>{
  const target=args[args.indexOf('--target')+1];
  const state=args.includes('--target')?{ECOM_CLI_STATE_DIR:path.join(path.dirname(target),'..','.ecom-test-state')}:{};
  const r=spawnSync(process.execPath,[entry,...args],{encoding:'utf8',env:{...process.env,...state,ECOM_CLI_UPDATE_CHECK:'0'},timeout:30000});
  assert.ok(r.stdout,r.stderr);return {exit:r.status,...JSON.parse(r.stdout)};
};
test('strict parser and discoverable command help refuse invalid writes',()=>{
  for(const argv of [['skill','install','--target'],['skill','install','--target','a','--target','b'],['containers','list','--yes'],['session','get'],['version','--wat']])assert.throws(()=>parse(argv));
  const result=invoke(path.join(root,'bin/ecom-cli.mjs'),['skill','status','--help','--json']);
  assert.equal(result.ok,true);assert.equal(result.options['--target'].type,'string');
});
test('offline and disabled automatic detection retain runtime',async()=>{
  const previous=global.fetch;global.fetch=async()=>{throw Error('offline');};
  try {const r=await checkUpdate();assert.equal(r.code,'REGISTRY_UNAVAILABLE');assert.equal(r.retained,true);}finally{global.fetch=previous;}
  const old=process.env.ECOM_CLI_UPDATE_CHECK;process.env.ECOM_CLI_UPDATE_CHECK='0';
  try{assert.equal((await checkUpdate({automatic:true})).disabled,true);}finally{if(old===undefined)delete process.env.ECOM_CLI_UPDATE_CHECK;else process.env.ECOM_CLI_UPDATE_CHECK=old;}
});
test('actual npm packed install, update repair, isolation, local-edits and doctor', {timeout:120000},()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-package-test-'));
  const runNpm=(args,cwd=tmp)=>{
    const r=spawnSync(npm,args,{cwd,encoding:'utf8',timeout:60000,shell:process.platform==='win32',env:{...process.env,npm_config_dry_run:'false',npm_config_json:'false'}});
    assert.equal(r.status,0,r.stderr);return r.stdout;
  };
  try {
    const packed=JSON.parse(runNpm(['pack','--json','--pack-destination',tmp],root))[0];
    const tarball=path.join(tmp,packed.filename), bootstrap=path.join(tmp,'bootstrap');
    runNpm(['install','--prefix',bootstrap,'--ignore-scripts','--no-audit','--no-fund',tarball]);
    const entry=path.join(bootstrap,'node_modules/@petercjl/ecom-cli/bin/ecom-cli.mjs');
    assert.equal(invoke(entry,['version','--json']).version,pkg.version);
    const a=path.join(tmp,'host-a','ecom-cli'), b=path.join(tmp,'host-b','ecom-cli');
    const args=(verb,target,agent='generic')=>['skill',verb,'--agent',agent,'--target',target,'--json'];
    assert.equal(invoke(entry,args('install',a)).current,true);
    const installed=invoke(entry,args('install',b,'custom-agent'));assert.equal(installed.current,true);
    assert.equal(invoke(entry,args('install',a)).changed,false); // same-version verified no-op
    fs.unlinkSync(path.join(a,'SKILL.md'));
    assert.equal(invoke(entry,args('update',a)).error.code,'LOCAL_EDITS'); // deletion is an edit
    fs.copyFileSync(path.join(root,'skills/ecom-cli/SKILL.md'),path.join(a,'SKILL.md'));
    // A stale managed version with intact files is repaired with recovery backup.
    const receipt=path.join(a,'.ecom-receipt.json'), meta=JSON.parse(fs.readFileSync(receipt));
    meta.version='0.0.0';fs.writeFileSync(receipt,JSON.stringify(meta));
    const repaired=invoke(entry,args('update',a));assert.equal(repaired.current,true);assert.ok(fs.statSync(repaired.backup).isDirectory());
    assert.notEqual(path.dirname(repaired.backup),path.dirname(a));
    const legacy=a+'.ecom-backup-fixture';fs.cpSync(repaired.backup,legacy,{recursive:true});
    const legacyMeta=JSON.parse(fs.readFileSync(receipt));legacyMeta.backup=legacy;fs.writeFileSync(receipt,JSON.stringify(legacyMeta));
    assert.equal(invoke(entry,args('status',a)).recovery.required,true);
    const migrated=invoke(entry,args('update',a));assert.equal(migrated.recovery.required,false);assert.equal(fs.existsSync(legacy),false);assert.equal(migrated.migratedBackups[0].from,legacy);assert.ok(fs.existsSync(migrated.migratedBackups[0].to));
    meta.version='0.0.0';fs.writeFileSync(receipt,JSON.stringify(meta));fs.writeFileSync(a+'.ecom-lock','lock');
    assert.equal(invoke(entry,args('update',a)).error.code,'TARGET_LOCKED');
    fs.unlinkSync(a+'.ecom-lock');assert.equal(invoke(entry,args('update',a)).current,true);
    fs.appendFileSync(path.join(a,'agents/openai.yaml'),'\n# customized UI metadata\n');
    assert.equal(invoke(entry,args('update',a)).error.code,'LOCAL_EDITS');
    assert.match(fs.readFileSync(path.join(a,'agents/openai.yaml'),'utf8'),/customized/);
    const unmanaged=path.join(tmp,'unmanaged');fs.mkdirSync(unmanaged);fs.writeFileSync(path.join(unmanaged,'notes'),'user data');
    assert.equal(invoke(entry,args('install',unmanaged)).error.code,'UNMANAGED_TARGET');
    fs.writeFileSync(b+'.ecom-lock','lock');assert.equal(invoke(entry,args('update',b,'custom-agent')).current,true); // current no-op bypasses lock without mutation
    fs.unlinkSync(b+'.ecom-lock');
    fs.rmSync(bootstrap,{recursive:true});fs.rmSync(a,{recursive:true});
    const survivor=path.join(b,'.runtime/bin/ecom-cli.mjs');
    assert.equal(invoke(survivor,['version','--json']).version,pkg.version);
    assert.equal(invoke(survivor,args('status',b,'custom-agent')).current,true);
    const doctor=invoke(survivor,['doctor','--json']);assert.ok(doctor.node);assert.equal(doctor.debuggingRequired,false);
    // Ensure no symlink or shared hardlink survived bootstrap removal.
    const visit=dir=>{for(const name of fs.readdirSync(dir)){const f=path.join(dir,name),st=fs.lstatSync(f);assert.equal(st.isSymbolicLink(),false);if(st.isDirectory())visit(f);else assert.equal(st.nlink,1);}};visit(b);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('real npm candidate update activates both runtime and Skill and preserves recovery',{timeout:120000},async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-update-test-'));
  let server;
  try {
    const candidate=path.join(tmp,'source');fs.mkdirSync(candidate);
    for(const name of ['package.json','capabilities.json','bin','lib','scripts','skills','README.md','INSTALL.md','UPDATE.md','LICENSE'])fs.cpSync(path.join(root,name),path.join(candidate,name),{recursive:true});
    for(const rel of ['package.json','capabilities.json','skills/ecom-cli/package.json']) {
      const f=path.join(candidate,rel),value=JSON.parse(fs.readFileSync(f));value.version='0.2.0';fs.writeFileSync(f,JSON.stringify(value));
    }
    const packed=spawnSync(npm,['pack','--json','--pack-destination',tmp],{cwd:candidate,encoding:'utf8',shell:process.platform==='win32'});assert.equal(packed.status,0,packed.stderr);
    const tar=fs.readFileSync(path.join(tmp,JSON.parse(packed.stdout)[0].filename));
    server=http.createServer((req,res)=>{
      if(req.url==='/candidate.tgz'){res.end(tar);return;}
      const port=server.address().port;
      res.setHeader('content-type','application/json');res.end(JSON.stringify({name:pkg.name,'dist-tags':{latest:'0.2.0'},versions:{'0.2.0':{name:pkg.name,version:'0.2.0',dist:{tarball:'http://127.0.0.1:'+port+'/candidate.tgz'}}}}));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const target=path.join(tmp,'skills/ecom-cli'), entry=path.join(root,'bin/ecom-cli.mjs'),args=['--agent','fixture-host','--target',target,'--json'];
    assert.equal(invoke(entry,['skill','install',...args]).current,true);
    const call=(env={})=>new Promise(resolve=>{
      const child=spawn(process.execPath,[path.join(target,'.runtime/bin/ecom-cli.mjs'),'update','install',...args,'--yes','--version','0.2.0'],{env:{...process.env,ECOM_CLI_STATE_DIR:path.join(tmp,'state'),npm_config_registry:'http://127.0.0.1:'+server.address().port,...env}});
      let output='';child.stdout.on('data',s=>output+=s);child.stderr.resume();child.on('close',code=>resolve({code,...JSON.parse(output)}));
    });
    const result=await call();assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.version,'0.2.0');assert.ok(result.backup);assert.ok(result.journal);
    assert.equal(invoke(result.entry,['version','--json']).version,'0.2.0');
    assert.equal(invoke(result.entry,['skill','status',...args]).current,true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.backup,'.runtime/package.json'))).version,pkg.version);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(tmp,{recursive:true,force:true});}
});
