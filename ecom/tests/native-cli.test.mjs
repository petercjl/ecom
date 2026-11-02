import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { validateReadUrl, resolveContainer } from '../cli.mjs';

test('native read URL rejects credentials and insecure schemes before submission',()=>{
  for(const url of ['http://sycm.taobao.com/','https://user:pass@sycm.taobao.com/','file:///tmp/data']) assert.throws(()=>validateReadUrl(url),{code:'INVALID_URL'});
  for(const key of ['token','_csrf','Cookie','clientSecret','sessionId']) assert.throws(()=>validateReadUrl('https://sycm.taobao.com/?'+key+'=hidden'),{code:'CREDENTIAL_INPUT_REJECTED'});
  assert.equal(validateReadUrl('https://sycm.taobao.com/?device=0'),'https://sycm.taobao.com/?device=0');
});
test('container selection requires a unique exact name or stable ID',()=>{
  const list=[{id:'a',name:'same'},{id:'b',name:'same'}];
  assert.equal(resolveContainer(list,'b').id,'b');
  assert.throws(()=>resolveContainer(list,'same'),{code:'CONTAINER_AMBIGUOUS'});
  assert.throws(()=>resolveContainer(list,'unknown'),{code:'CONTAINER_NOT_FOUND'});
});
test('actual native CLI exposes dev capabilities and structured failure without connecting a browser',()=>{
  const script=new URL('../cli.mjs',import.meta.url);
  const caps=JSON.parse(execFileSync(process.execPath,[script.pathname,'capabilities'],{encoding:'utf8'}));
  assert.equal(caps.debuggingRequired,false);
  assert.deepEqual(caps.commands.slice(0,2),['containers list','session get']);
  for(const command of ['shops manage','shops create','shops configure','shops open','shops verify','shops confirm']) assert.ok(caps.commands.includes(command));
  assert.throws(()=>execFileSync(process.execPath,[script.pathname,'evaluate'],{encoding:'utf8',stdio:'pipe'}),e=>JSON.parse(e.stderr).error.code==='UNSUPPORTED_COMMAND');
});

test('shop CLI rejects incomplete creation and confirmation before native calls',()=>{
 const script=new URL('../cli.mjs',import.meta.url).pathname;
 for(const args of [['shops','create','--name','Example'],['shops','confirm','--container','unknown'],['shops','configure','--container','unknown'],['shops','delete','--container','unknown'],['shops','update','--container','unknown']]) {
  assert.throws(()=>execFileSync(process.execPath,[script,...args],{encoding:'utf8',stdio:'pipe'}),e=>JSON.parse(e.stderr).error.code==='INVALID_SHOP_COMMAND');
 }
});
