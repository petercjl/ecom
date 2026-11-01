// Isolated feasibility experiment: real Ecom containers, synthetic local
// HttpOnly sessions, and background service-worker requests without page tabs.
// This is not the product CLI and never reads a merchant/buyer profile.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const executable = path.join(root, '.brave-build/src/out/Component_arm64/Ecom Dev.app/Contents/MacOS/Ecom Dev');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = fs.mkdtempSync(path.join(root, '.brave-build/container-background-'));
fs.chmodSync(run, 0o700);
const profile = path.join(run, 'profile');
fs.mkdirSync(profile, { mode: 0o700 });
const log = path.join(run, 'browser.log');
const logFd = fs.openSync(log, 'wx', 0o600);
const reportFile = path.join(run, 'result.json');
const report = { experiment: 'ecom-native-container-background-v1', syntheticDataOnly: true, platform: process.platform, arch: process.arch, checks: [], rounds: [], ok: false };
const tokens = new Map(['A','B'].map(label => [label, crypto.randomBytes(24).toString('hex')]));
const names = { A: 'Ecom-Probe-A', B: 'Ecom-Probe-B' };
let server, browser, client, origin;
const front = () => {
  const asn=spawnSync('lsappinfo', ['front'], {encoding:'utf8'}).stdout?.trim();
  return asn ? spawnSync('lsappinfo',['info','-only','bundleID',asn],{encoding:'utf8'}).stdout?.trim() || null : null;
};
const frontSamples = [];
let monitor;
let launchCount=0;

class CDP {
  constructor(socket) {
    this.socket=socket; this.next=0; this.pending=new Map();
    socket.addEventListener('message', event => {
      const message=JSON.parse(event.data); const item=this.pending.get(message.id);
      if (!item) return; this.pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('CDP disconnected')); }
      this.pending.clear();
    });
  }
  async call(method, params={}, sessionId, timeout=15000) {
    const id=++this.next;
    return new Promise((resolve,reject) => {
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},timeout);
      this.pending.set(id,{resolve,reject,timer});
      this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  }
  async evaluate(targetId, expression) {
    const {sessionId}=await this.call('Target.attachToTarget',{targetId,flatten:true});
    const result=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:false},sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return {value:result.result?.value,sessionId};
  }
}
async function until(fn, label, timeout=30000) {
  const end=Date.now()+timeout; let last;
  while (Date.now()<end) {
    try { const value=await fn(); if (value) return value; } catch(error) {last=error;}
    await pause(150);
  }
  throw new Error('Timed out: '+label+(last?' ('+last.message+')':''));
}
function check(name, value, details={}) {
  report.checks.push({name,passed:Boolean(value),...details});
  assert.ok(value,name);
}
function launch(label, seed, first=false) {
  launchCount++;
  const previousEndpoint=path.join(profile,'DevToolsActivePort');
  if(first && fs.existsSync(previousEndpoint)) {
    const saved=path.join(run,`previous-endpoint-${launchCount}.txt`);
    assert.ok(!fs.existsSync(saved));fs.renameSync(previousEndpoint,saved);
  }
  const args=[`--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--restore-last-session',
    '--disable-features=DialMediaRouteProvider,MacAppCodeSignClone', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    ...(label?[`--container=${names[label]}`, `${origin}/scope/${label}/${seed?'seed':'verify'}`]:['chrome://settings'])];
  const child=spawn(executable,args,{cwd:path.dirname(path.dirname(path.dirname(executable))),stdio:['ignore',logFd,logFd]});
  child.on('error',()=>{});
  if (first) browser=child;
  return child;
}
async function connect() {
  const portFile=path.join(profile,'DevToolsActivePort');
  const data=await until(()=> {
    if (!fs.existsSync(portFile)) return null;
    const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split('\n');
    return /^\d+$/.test(port)&&endpoint?.startsWith('/devtools/browser/')?{port:Number(port),endpoint}:null;
  },'isolated Ecom debugger');
  const socket=new WebSocket(`ws://127.0.0.1:${data.port}${data.endpoint}`);
  await once(socket,'open',{signal:AbortSignal.timeout(10000)});
  client=new CDP(socket);
  const version=await client.call('Browser.getVersion');
  return {pid:browser.pid,port:data.port,headless:/HeadlessChrome/.test(version.userAgent),product:version.product};
}
async function targets() {return (await client.call('Target.getTargets')).targetInfos;}
async function waitPage(label) {
  const page=await until(async()=> (await targets()).find(t=>t.type==='page'&&t.url.startsWith(`${origin}/scope/${label}/`)), 'container page '+label);
  await until(async()=> {
    const result=await client.evaluate(page.targetId,'({ready:globalThis.probeReady===true,httpOnlyHidden:!document.cookie.includes("ecom_probe_session=")})');
    await client.call('Target.detachFromTarget',{sessionId:result.sessionId});
    return result.value?.ready&&result.value.httpOnlyHidden;
  },'local service worker '+label);
  return page;
}
async function worker(label, page) {
  const wake=await client.evaluate(page.targetId,"navigator.serviceWorker.ready.then(r=>{r.active.postMessage('probe-keepalive');return true})");
  await client.call('Target.detachFromTarget',{sessionId:wake.sessionId});
  return until(async()=> (await targets()).find(t=>t.type==='service_worker'&&t.url===`${origin}/worker-${label}.js`),'worker '+label);
}
function containers() {
  const prefs=JSON.parse(fs.readFileSync(path.join(profile,'Default/Preferences'),'utf8'));
  const found=new Map();
  function walk(value) {
    if (!value||typeof value!=='object') return;
    if (Object.values(names).includes(value.name)&&typeof value.id==='string') found.set(value.name,value.id);
    for(const child of Object.values(value)) walk(child);
  }
  walk(prefs); return Object.fromEntries(found);
}
async function closeBrowser() {
  if (client) {try {await client.call('Browser.close',{},undefined,5000);}catch{} client.socket.close();client=null;}
  if (browser) {
    await until(()=>browser.exitCode!==null||browser.signalCode!==null,'probe browser exit',15000);
    browser=null;
  }
}
async function provisionContainers() {
  launch(null,false,true);await connect();
  const created=await client.call('Target.createTarget',{url:'chrome://settings/braveContent',background:true});
  const page=await until(async()=>(await targets()).find(t=>t.targetId===created.targetId),'isolated settings bootstrap');
  const result=await client.evaluate(page.targetId,`(async()=>{
    await customElements.whenDefined('settings-brave-content-containers');
    const element=document.createElement('settings-brave-content-containers');
    const handler=element.browserProxy.handler;
    for(const name of ${JSON.stringify(Object.values(names))}) {
      const result=await handler.addContainer({id:'',name,icon:0,backgroundColor:{value:0xff007c80}});
      if(result.error!==null && result.error!==undefined) throw new Error('Native container creation failed: '+result.error);
    }
    return (await handler.getContainers()).containers.filter(c=>${JSON.stringify(Object.values(names))}.includes(c.name)).map(c=>({id:c.id,name:c.name}));
  })()`);
  check('persistent containers created through native settings handler',result.value?.length===2&&result.value.every(c=>!c.id.startsWith('t-')));
  await closeBrowser();
}
async function round(seed) {
  launch('A',seed,true); await connect();
  const setupPage=await waitPage('A');
  if(seed) {
    const attached=await client.call('Target.attachToTarget',{targetId:setupPage.targetId,flatten:true});
    await client.call('Page.navigate',{url:`${origin}/scope/A/verify`},attached.sessionId);
    await waitPage('A');
  }
  // Restore A's actual native container tab while opening B at the next
  // startup. No Profile or Cookie file is copied or rewritten.
  await closeBrowser();
  launch('B',seed,true); const identity=await connect();
  check('headless mode '+(seed?'initial':'restored'),identity.headless);
  const a=await waitPage('A');
  const b=await waitPage('B');
  check('two real tabs share CDP browser context',(a.browserContextId||'default')===(b.browserContextId||'default'));
  const sessions={};
  for (const label of ['A','B']) {
    const t=await worker(label,label==='A'?a:b);
    const attached=await client.call('Target.attachToTarget',{targetId:t.targetId,flatten:true});
    await client.call('Runtime.enable',{},attached.sessionId);
    sessions[label]=attached.sessionId;
  }
  for(const t of (await targets()).filter(t=>t.type==='page')) await client.call('Target.closeTarget',{targetId:t.targetId});
  await until(async()=>!(await targets()).some(t=>t.type==='page'),'asynchronous tab closure');
  check('all page tabs closed '+(seed?'initial':'restored'),!(await targets()).some(t=>t.type==='page'));
  const results=[];
  for (let i=0;i<6;i++) {
    for (const label of ['A','B']) {
      const response=await client.call('Runtime.evaluate',{
        expression:`fetch(${JSON.stringify(origin+'/api/whoami')},{credentials:'include'}).then(r=>r.json())`,
        awaitPromise:true,returnByValue:true,userGesture:false
      },sessions[label]);
      if(response.exceptionDetails) throw new Error('Worker request exception');
      const actual=response.result?.value;
      check('background session '+label+' #'+i,actual?.label===label);
      results.push({expected:label,actual:actual.label});
    }
  }
  // Test per-container concurrent requests without a global active-shop
  // selector. Existing production tools still need their own pacing policy.
  const simultaneous=await Promise.all(['A','B'].map(async label=> {
    const result=await client.call('Runtime.evaluate',{expression:`fetch(${JSON.stringify(origin+'/api/whoami')},{credentials:'include'}).then(r=>r.json())`,awaitPromise:true,returnByValue:true,userGesture:false},sessions[label]);
    return {expected:label,actual:result.result?.value?.label};
  }));
  check('concurrent container routing',simultaneous.every(item=>item.actual===item.expected));
  check('requests complete without reopening tabs',!(await targets()).some(t=>t.type==='page'));
  report.rounds.push({seed,identity,requests:results.length+simultaneous.length,isolatedSessions:true,pageTabsDuringRequests:0});
  await closeBrowser();
  const ids=containers();
  check('two persisted native containers',ids[names.A]&&ids[names.B]&&ids[names.A]!==ids[names.B]);
  return ids;
}
try {
  assert.equal(process.platform,'darwin'); assert.equal(process.arch,'arm64');
  assert.ok(fs.statSync(executable).isFile());
  report.executableSha256=crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
  server=http.createServer((request,response)=> {
    const url=new URL(request.url,'http://localhost');
    response.setHeader('Cache-Control','no-store');
    const workerMatch=url.pathname.match(/^\/worker-([AB])\.js$/);
    if(workerMatch) {response.setHeader('Content-Type','application/javascript');response.end("self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',e=>e.waitUntil(new Promise(r=>setTimeout(r,15000))));");return;}
    const pageMatch=url.pathname.match(/^\/scope\/([AB])\/(seed|verify)$/);
    if(pageMatch) {
      const [,label,phase]=pageMatch;
      if(phase==='seed') response.setHeader('Set-Cookie',`ecom_probe_session=${tokens.get(label)}; HttpOnly; SameSite=Lax; Max-Age=86400; Path=/`);
      response.setHeader('Content-Type','text/html');
      response.end(`<title>Ecom synthetic container ${label}</title><script>navigator.serviceWorker.register('/worker-${label}.js',{scope:'/scope/${label}/'}).then(()=>navigator.serviceWorker.ready).then(()=>globalThis.probeReady=true)</script>`);return;
    }
    if(url.pathname==='/api/whoami') {
      const match=String(request.headers.cookie||'').match(/(?:^|;\s*)ecom_probe_session=([^;]+)/);
      const label=[...tokens].find(([,token])=>token===match?.[1])?.[0]||'unauthenticated';
      response.setHeader('Content-Type','application/json');response.end(JSON.stringify({label}));return;
    }
    response.statusCode=404;response.end();
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening'); origin=`http://127.0.0.1:${server.address().port}`;
  frontSamples.push(front()); monitor=setInterval(()=>frontSamples.push(front()),200);
  console.log(JSON.stringify({event:'probe-start',evidence:run,syntheticDataOnly:true}));
  await provisionContainers();
  const initial=await round(true); const restored=await round(false);
  check('container IDs persist across restart',Object.values(names).every(name=>initial[name]===restored[name]));
  report.ok=true;
} catch(error) {
  report.error={name:error.name,message:error.message};process.exitCode=1;
  try {report.diagnosticTargets=(await targets()).map(t=>({type:t.type,url:t.url.replace(origin,'local-test-origin').split('?')[0]}));}catch{}
}
finally {
  clearInterval(monitor);frontSamples.push(front());
  report.focus={samples:frontSamples.length,unchanged:frontSamples.every(value=>value&&value===frontSamples[0]),ecomForegroundSamples:frontSamples.filter(value=>value?.includes('app.ecom.browser.dev')).length};
  try {await closeBrowser();} catch {if(browser) browser.kill('SIGTERM');}
  if(server) await new Promise(resolve=>server.close(resolve));
  fs.closeSync(logFd);
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({...report,evidence:run}));
}
