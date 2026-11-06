import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateWindowsRelease,windowsPackage,validateWindowsParts,windowsPackBudget} from '../windows-release-contract.mjs';
import {validateWindowsPublication,windowsRegistryStatus} from '../verify-windows-payload.mjs';
const config=JSON.parse(fs.readFileSync(new URL('../windows-release-config.json',import.meta.url)));
const record={...config,sourceRevision:'a'.repeat(40),tarballSha256:'b'.repeat(64),evidencePath:'docs/ecom/release-evidence/windows-test.md',nativeSmokeTest:false,localUpdateRecoveryVerified:false,updaterSelfTest:true,payloadVerified:true,corruptedPartRejected:true,devValidation:{verified:true,sourceRevision:'a'.repeat(40),evidencePath:'docs/ecom/release-evidence/dev.md'},updateRoundTripVerified:false,rollbackRoundTripVerified:false};
test('Windows payload cannot be confused with a Mac or another architecture',()=>{
  assert.equal(validateWindowsRelease(config),config);
  for(const patch of [{platform:'darwin'},{arch:'arm64'},{packageName:'@petercjl/ecom-macos-arm64'},{version:'1.0.0/../../x'},{updateProtocol:2}])assert.throws(()=>validateWindowsRelease({...config,...patch}));
  assert.deepEqual(windowsPackage(config).os,['win32']);assert.deepEqual(windowsPackage(config).cpu,['x64']);
});
test('direct Windows latest requires Dev and package checks without a next round trip',()=>{
  assert.equal(validateWindowsPublication(record,config,'latest'),record);
  assert.equal(validateWindowsPublication(record,config,'next'),record);
  for(const gate of ['updaterSelfTest','payloadVerified','corruptedPartRejected'])assert.throws(()=>validateWindowsPublication({...record,[gate]:false},config,'latest'));
  assert.throws(()=>validateWindowsPublication({...record,devValidation:undefined},config,'latest'));
  assert.throws(()=>validateWindowsPublication({...record,devValidation:{...record.devValidation,verified:false}},config,'latest'));
});
test('unpublished Windows versions can be created directly under latest',async()=>{
  const absent=async()=>new Response('',{status:404});
  assert.equal(await windowsRegistryStatus(config.version,'latest',absent),null);
  assert.equal(await windowsRegistryStatus(config.version,'next',absent),null);
  await assert.rejects(windowsRegistryStatus(config.version,'latest',async()=>new Response('',{status:403})),/Cannot query/);
});

test('part layout rejects gaps, duplicates, version drift and oversized publication units',()=>{
  const part={index:0,version:'0.1.0-payload.0',bytes:50_000_000,sha256:'a'.repeat(64),tarballSha256:'b'.repeat(64),integrity:'sha512-'+Buffer.alloc(64).toString('base64'),tarballBytes:50_100_000};
  const artifact={version:'0.1.0',payloadFormat:'npm-parts-v1',archiveBytes:50_000_000,parts:[part]};
  assert.equal(validateWindowsParts(artifact),artifact);
  for(const patch of [{index:1},{version:'0.1.1-payload.0'},{bytes:50_000_001},{tarballBytes:windowsPackBudget+1},{integrity:'bad'}])assert.throws(()=>validateWindowsParts({...artifact,parts:[{...part,...patch}]}));
  assert.throws(()=>validateWindowsParts({...artifact,parts:[part,part]}));
  assert.throws(()=>validateWindowsParts({...artifact,archiveBytes:49_999_999}));
});
