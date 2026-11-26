// Synthetic cross-site login regression. Uses an isolated profile and two
// native containers; never reads or changes merchant credentials.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const executable = path.join(root, '.brave-build/src/out/Component_arm64/Ecom Dev.app/Contents/MacOS/Ecom Dev');
const run = fs.mkdtempSync(path.join(root, '.brave-build/cross-site-login-'));
fs.chmodSync(run, 0o700);
const profile = path.join(run, 'profile');
fs.mkdirSync(profile, {mode: 0o700});
const explicitBlock = process.argv.includes('--explicit-block');
const expected = !process.argv.includes('--expect-blocked') && !explicitBlock;
if (explicitBlock) {
  fs.mkdirSync(path.join(profile, 'Default'), {mode: 0o700});
  fs.writeFileSync(path.join(profile, 'Default/Preferences'), JSON.stringify({profile: {cookie_controls_mode: 1}}), {flag: 'wx', mode: 0o600});
}
fs.writeFileSync(path.join(run, 'manifest.json'), JSON.stringify({purpose: 'Synthetic cross-site cookie persistence and native container isolation',profile,expected,explicitBlock,cleanup: 'Remove this generated profile after the browser exits; retain report/log',estimatedProfileBytes: 100000000}), {flag: 'wx', mode: 0o600});
const fd = fs.openSync(path.join(run, 'browser.log'), 'wx', 0o600);
const checks = [];
let client, browser, port, phase = 0;
const requests = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const hasSession = /(?:^|;\s*)ecom_sso_probe=synthetic(?:;|$)/.test(req.headers.cookie || '');
  requests.push({path: url.pathname, host: url.hostname, hasSession});
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html');
  if (url.pathname === '/parent') res.end(`<iframe src="http://127.0.0.1:${port}/set"></iframe>`);
  else if (url.pathname === '/set') {
    res.setHeader('Set-Cookie', 'ecom_sso_probe=synthetic; Path=/; Max-Age=3600; SameSite=None; Secure; HttpOnly');
    res.end('synthetic login completed');
  } else res.end(`<title>probe</title><body>${hasSession ? 'SESSION_PRESENT' : 'SESSION_ABSENT'}</body>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
port = server.address().port;

async function until(fn, label) {
  for (let i = 0; i < 100; i++) { const value = await fn(); if (value) return value; await pause(100); }
  throw Error('Timed out: ' + label);
}
function launch(container, url) {
  const child = spawn(executable, [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--use-mock-keychain', '--remote-debugging-port=0', '--disable-features=DialMediaRouteProvider,MacAppCodeSignClone', `--container=${container}`, url], {stdio: ['ignore', fd, fd]});
  child.on('error', error => console.error(error.message));
  return child;
}
async function connect() {
  const info = await until(() => {try {const [p, endpoint] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');return {p,endpoint};} catch {return null;}}, 'isolated debugger');
  const socket = new WebSocket(`ws://127.0.0.1:${info.p}${info.endpoint}`);
  await new Promise((resolve, reject) => {socket.onopen=resolve;socket.onerror=reject;});
  let seq=0;const pending=new Map();
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id);}};
  client={socket,async call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(m.error.message)):resolve(m.result);});socket.send(JSON.stringify({id,method,params,sessionId}));});}};
}
async function target(url) {
  const t = await until(async()=> (await client.call('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url===url), 'target '+url);
  return (await client.call('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;
}
async function read(session) {
  return (await client.call('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true},session)).result.value;
}
function check(name,actual,want) {checks.push({name,actual,expected:want});assert.equal(actual,want,name);}
async function quit() {
  if (!client) return;
  await client.call('Browser.close').catch(()=>{});client.socket.close();client=null;
  await until(()=>browser.exitCode!==null||browser.signalCode!==null,'browser exit');
}
let ok=false;
try {
  const parent=`http://localhost:${port}/parent`;
  browser=launch('Cookie-Probe-A',parent);await connect();
  const a=await target(parent);
  await until(()=>requests.some(r=>r.path==='/set'),'cross-site cookie response');
  await pause(300);
  const first=`http://127.0.0.1:${port}/read?phase=first`;
  await client.call('Page.navigate',{url:first},a);
  await until(async()=>/SESSION_/.test(await read(a)),'top-level result');
  check('cross-site session available on top-level navigation',(await read(a))==='SESSION_PRESENT',expected);
  const second=`http://127.0.0.1:${port}/read?phase=other-container`;
  launch('Cookie-Probe-B',second);const b=await target(second);
  await until(async()=>/SESSION_/.test(await read(b)),'other container result');
  check('second native container stays isolated',(await read(b))==='SESSION_PRESENT',false);
  await quit();
  const endpoint=path.join(profile,'DevToolsActivePort');
  if(fs.existsSync(endpoint))fs.renameSync(endpoint,path.join(run,`endpoint-${++phase}.txt`));
  const restart=`http://127.0.0.1:${port}/read?phase=restart`;
  browser=launch('Cookie-Probe-A',restart);await connect();const restored=await target(restart);
  await until(async()=>/SESSION_/.test(await read(restored)),'restarted container result');
  check('persistent session survives browser restart',(await read(restored))==='SESSION_PRESENT',expected);
  ok=true;
} finally {
  await quit();await new Promise(resolve=>server.close(resolve));fs.closeSync(fd);
  fs.writeFileSync(path.join(run,'result.json'),JSON.stringify({ok,expected,explicitBlock,checks,requests},null,2),{flag:'wx',mode:0o600});
  // Only this uniquely created synthetic profile is disposable.
  assert.equal(path.dirname(fs.realpathSync(profile)),fs.realpathSync(run));
  fs.rmSync(profile,{recursive:true});
  console.log(JSON.stringify({ok,report:path.join(run,'result.json'),checks,profileRemoved:!fs.existsSync(profile)}));
}
