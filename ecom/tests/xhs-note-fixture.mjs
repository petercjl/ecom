// Integration witness: actual CLI + native Ecom Dev, all writes to loopback.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {deflateSync,crc32} from 'node:zlib';

const [profile,container,cli='packages/ecom-cli/bin/ecom-cli.mjs'] = process.argv.slice(2);
assert.ok(profile && container,'Usage: node ecom/tests/xhs-note-fixture.mjs PROFILE CONTAINER [CLI]');
const run = promisify(execFile);
const dir = await fs.mkdtemp(path.join(os.tmpdir(),'ecom-note-fixture-'));
const account = 'a'.repeat(24);
const noteId = 'b'.repeat(24);
const body = '第一段。\n\n第二段 🐶';
const title = '图文集成测试';
const topic = '本地测试';
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
function png(color) {
  const chunk = (type,data)=>{
    const tag = Buffer.from(type);
    const out = Buffer.alloc(data.length+12);
    out.writeUInt32BE(data.length);
    tag.copy(out,4);
    data.copy(out,8);
    out.writeUInt32BE(crc32(Buffer.concat([tag,data])),8+data.length);
    return out;
  };
  const head = Buffer.from('00000001000000010802000000','hex');
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',head),
    chunk('IDAT',deflateSync(Buffer.from([0,...color]))),chunk('IEND',Buffer.alloc(0))]);
}
const files = [png([9,10,11]),png([50,51,52])];
const expectedHashes = files.map(sha);
const html = `<!doctype html><meta charset="utf-8">
<button role="tab">上传图文</button><main></main>
<script>
const main = document.querySelector('main');
document.querySelector('button').onclick = () => {
  main.innerHTML = '<input type="file" accept="image/png,image/jpeg" multiple>';
  main.firstChild.onchange = async e => {
    const selected = [...e.target.files];
    const bytes = await Promise.all(selected.map(async file => {
      const array = new Uint8Array(await file.arrayBuffer());
      return array.toBase64();
    }));
    const uploaded = await fetch('/fixture/upload',{method:'POST',body:JSON.stringify(bytes)});
    if (!uploaded.ok) return;
    main.innerHTML = '<section></section><input placeholder="填写标题"><div style="white-space:pre-wrap;min-height:40px" contenteditable="true"></div><button>发布</button>';
    for (const file of selected) {
      const el = document.createElement('div');
      el.dataset.xhsImage = '';
      const image = document.createElement('img');
      image.width = 30; image.src = URL.createObjectURL(file);
      el.append(image); main.firstChild.append(el);
    }
    main.querySelector('button').onclick = async () => {
      const r = await fetch('/fixture/publish',{method:'POST',body:JSON.stringify({
        title:main.querySelector('input').value,text:main.querySelector('[contenteditable]').innerText
      })});
      const data = await r.json();
      if (!data.noteId) return;
      const marker = document.createElement('div');
      marker.dataset.xhsPublished = data.noteId;
      marker.dataset.xhsTitle = data.title;
      marker.textContent = '发布成功';
      main.append(marker);
    };
  };
};
</script>`;
const writes = [];
let mode = 'success';
const server = http.createServer(async (req,res)=>{
  const send=(status,type,value)=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(value);};
  if(req.url==='/publish/publish')return send(200,'text/html; charset=utf-8',html);
  if(req.url==='/fixture/account')return send(200,'application/json',JSON.stringify({success:true,data:{userId:account,nickname:'Fixture'}}));
  if(req.method!=='POST'||!['/fixture/upload','/fixture/publish'].includes(req.url))return send(404,'text/plain','');
  const chunks=[];
  for await (const chunk of req) chunks.push(chunk);
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  writes.push({path:req.url,data});
  if(req.url==='/fixture/upload')return send(200,'application/json','{}');
  return send(200,'application/json',JSON.stringify(mode==='success'?{noteId,title:data.title}:{}));
});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const base=['--profile',profile,'--container',container,'--json'];
async function command(action, args=[], errorCode) {
  let stdout;
  try { ({stdout}=await run(process.execPath,[cli,'xhs','note',action,...args],{timeout:125000})); }
  catch (error) {
    if(!error.stdout)throw error;
    stdout=error.stdout;
  }
  const result=JSON.parse(stdout);
  if(errorCode)assert.equal(result.error?.code,errorCode,stdout);
  else assert.equal(result.ok,true,stdout);
  return result;
}
try {
  await Promise.all(files.map((bytes,i)=>fs.writeFile(path.join(dir,i+'.png'),bytes,{flag:'wx'})));
  const manifest=path.join(dir,'note.json');
  await fs.writeFile(manifest,JSON.stringify({title,body,topics:[topic],images:['0.png','1.png']}),{flag:'wx'});
  const preflight=await command('preflight',['--manifest',manifest,'--json']);
  assert.deepEqual(preflight.note.images.map(m=>m.sha256),expectedHashes);
  const prepare=async (testRejections=false)=>{
    const open=await command('open',[...base,'--fixture-port',String(server.address().port)]);
    assert.equal(open.state,'account-ready',JSON.stringify(open));
    assert.equal(open.accountId,account);
    const pinned=[...base,'--fixture','--instance',open.instance.id,'--preparation',open.preparationId];
    const input=[...pinned,'--manifest',manifest];
    if(testRejections) {
      await command('prepare',[...input,'--account-id','c'.repeat(24),'--digest',preflight.manifestDigest],'XHS_ACCOUNT_NOT_VERIFIED');
      await command('prepare',[...input,'--account-id',account,'--digest','f'.repeat(64)],'XHS_MANIFEST_CHANGED');
      assert.equal(writes.length,0);
    }
    const prepare=await command('prepare',[...input,'--account-id',account,'--digest',preflight.manifestDigest]);
    assert.equal(prepare.state,'form-ready',JSON.stringify({prepare,writes:writes.map(x=>x.path)}));
    assert.equal(prepare.imageCount,2);
    return {pinned,prepare,submit:[...pinned,'--account-id',account,'--confirm',prepare.confirmation]};
  };
  const first=await prepare(true);
  assert.equal(writes.length,1);
  assert.deepEqual(writes[0].data.map(s=>sha(Buffer.from(s,'base64'))),expectedHashes);
  await command('submit',[...first.pinned,'--account-id',account,'--confirm',
    first.prepare.preparationId+':'+ 'f'.repeat(64)],'XHS_CONFIRMATION_MISMATCH');
  assert.equal(writes.length,1);
  const published=await command('submit',first.submit);
  assert.equal(published.state,'published',JSON.stringify(published));
  assert.equal(published.noteId,noteId);
  assert.deepEqual(writes[1],{path:'/fixture/publish',data:{title,text:body+'\n\n#'+topic}});
  await command('submit',first.submit,'XHS_SUBMISSION_ALREADY_ATTEMPTED');
  assert.equal((await command('status',first.pinned)).noteId,noteId);
  mode='unknown';
  const second=await prepare();
  const unknown=await command('submit',second.submit);
  assert.equal(unknown.state,'submission-unknown',JSON.stringify(unknown));
  assert.equal((await command('status',second.pinned)).state,'submission-unknown');
  await command('submit',second.submit,'XHS_SUBMISSION_ALREADY_ATTEMPTED');
  assert.equal(writes.filter(x=>x.path==='/fixture/publish').length,2);
  console.log(JSON.stringify({ok:true,fixture:true,preflight:'verified',prepare:'verified',
    mediaOrder:'verified',accountMismatch:'refused',changedDigest:'refused',
    missingConfirmation:'refused',published:'verified',unknown:'no replay',publishRequests:2}));
} finally {
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  await fs.rm(dir,{recursive:true,force:true});
}
