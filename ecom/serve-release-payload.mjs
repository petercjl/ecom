// Temporary, single-file HTTPS-tunnel source for the OIDC workflow. No directory
// browsing or repository files are exposed; the workflow pins the receipt hash.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
const file=path.resolve(process.argv[2]||'');
if(!fs.statSync(file).isFile()||!file.endsWith('.tar'))throw new Error('Supply the verified Windows transfer archive');
const token=crypto.randomBytes(32).toString('hex'),size=fs.statSync(file).size;
const server=http.createServer((request,response)=>{
  if(request.url!=='/'+token+'/windows-transfer.tar'||!['GET','HEAD'].includes(request.method)){response.writeHead(404).end();return;}
  response.writeHead(200,{'Content-Type':'application/x-tar','Content-Length':size,'Cache-Control':'no-store'});
  if(request.method==='HEAD')response.end();else fs.createReadStream(file).pipe(response);
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,path:'/'+token+'/windows-transfer.tar',bytes:size})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
