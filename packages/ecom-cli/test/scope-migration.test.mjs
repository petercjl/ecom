import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,pkg} from '../lib/common.mjs';
import {checkUpdate} from '../lib/maintenance.mjs';

test('update detection uses the canonical scope and rejects another package identity',async()=>{
  const original=global.fetch;
  try {
    global.fetch=async url=>{
      assert.equal(url,'https://registry.npmjs.org/@lumyne%2fecom-cli/latest');
      return {ok:true,json:async()=>({name:pkg.name,version:'0.4.1'})};
    };
    assert.equal((await checkUpdate()).available,true);
    global.fetch=async()=>({ok:true,json:async()=>({name:'@petercjl/ecom-cli',version:'9.0.0'})});
    assert.equal((await checkUpdate()).code,'REGISTRY_UNAVAILABLE');
  }finally{global.fetch=original;}
});

test('packed new scope explicitly migrates a real old CLI installation with backups and edit guards',{timeout:120000},()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ecom-scope-migration-'));
  const env={...process.env,ECOM_CLI_UPDATE_CHECK:'0',ECOM_CLI_STATE_DIR:path.join(tmp,'state')};
  const run=(entry,args)=>{
    const r=spawnSync(process.execPath,[entry,...args,'--json'],{env,encoding:'utf8',timeout:30000});
    assert.ok(r.stdout,r.stderr);return JSON.parse(r.stdout);
  };
  const npm=(args)=>{
    const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:tmp,env:{...env,npm_config_dry_run:'false',npm_config_json:'false'},encoding:'utf8',timeout:60000,shell:process.platform==='win32'});
    assert.equal(r.status,0,r.stderr);return r.stdout;
  };
  try {
    const oldPrefix=path.join(tmp,'old');
    npm(['install','--prefix',oldPrefix,'--ignore-scripts','--no-audit','--no-fund',path.join(root,'test/fixtures/npm/petercjl-ecom-cli-0.3.0.tgz')]);
    const old=path.join(oldPrefix,'node_modules/@petercjl/ecom-cli/bin/ecom-cli.mjs');
    const packed=JSON.parse(npm(['pack',root,'--json','--pack-destination',tmp]))[0];
    const fresh=path.join(tmp,'new');npm(['install','--prefix',fresh,'--ignore-scripts','--no-audit','--no-fund',path.join(tmp,packed.filename)]);
    const next=path.join(fresh,'node_modules',...pkg.name.split('/'),'bin/ecom-cli.mjs');
    const target=path.join(tmp,'host-a/ecom-cli'),other=path.join(tmp,'host-b/ecom-cli');
    const options=target=>['--agent','scope-fixture','--target',target];
    for(const selected of [target,other])assert.equal(run(old,['skill','install',...options(selected)]).current,true);
    const prior=fs.readFileSync(path.join(target,'SKILL.md'));
    const untouched=fs.readFileSync(path.join(other,'.ecom-receipt.json'));
    assert.equal(run(next,['skill','status',...options(target)]).migration.available,true);
    assert.equal(run(next,['skill','update',...options(target)]).error.code,'UNMANAGED_TARGET');
    assert.equal(run(next,['skill','migrate','--from-package','@unrelated/cli',...options(target)]).error.code,'INVALID_ARGUMENT');
    fs.appendFileSync(path.join(target,'SKILL.md'),'\nlocal fixture edit\n');
    assert.equal(run(next,['skill','migrate','--from-package','@petercjl/ecom-cli',...options(target)]).error.code,'LOCAL_EDITS');
    fs.writeFileSync(path.join(target,'SKILL.md'),prior);
    const migrated=run(next,['skill','migrate','--from-package','@petercjl/ecom-cli',...options(target)]);
    assert.equal(migrated.current,true);assert.equal(migrated.package,pkg.name);assert.equal(migrated.version,pkg.version);
    assert.deepEqual(migrated.migratedFrom,{package:'@petercjl/ecom-cli',version:'0.3.0'});
    assert.deepEqual(fs.readFileSync(path.join(migrated.backup,'SKILL.md')),prior);
    assert.equal(JSON.parse(fs.readFileSync(path.join(migrated.backup,'.runtime/package.json'))).name,'@petercjl/ecom-cli');
    assert.deepEqual(fs.readFileSync(path.join(other,'.ecom-receipt.json')),untouched);
    assert.equal(run(next,['skill','migrate','--from-package','@petercjl/ecom-cli',...options(target)]).changed,false);
    fs.rmSync(fresh,{recursive:true});fs.rmSync(oldPrefix,{recursive:true});
    assert.equal(run(migrated.entry,['version']).package,pkg.name);
    assert.equal(run(migrated.entry,['skill','status',...options(target)]).current,true);
    assert.equal(run(migrated.entry,['routing','enable','--help']).options['--expected-revision'].required,true);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
