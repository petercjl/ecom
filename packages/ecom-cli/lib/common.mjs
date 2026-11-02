import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
export const fail = (code,message,extra={}) => Object.assign(new Error(message),{code,...extra});
export function exists(p) { try { fs.lstatSync(p); return true; } catch(e) { if(e.code==='ENOENT') return false; throw e; } }
export function tree(dir, prefix='') {
  const out={};
  for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if(item.name==='.ecom-receipt.json' || item.name==='.ecom-operation.json') continue;
    const rel=prefix+item.name, p=path.join(dir,item.name), st=fs.lstatSync(p);
    if(st.isSymbolicLink() || (!st.isDirectory() && (!st.isFile() || st.nlink!==1))) throw fail('UNSAFE_PATH','Shared links and special files are not supported');
    if(st.isDirectory()) Object.assign(out,tree(p,rel+'/'));
    else out[rel]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  }
  return out;
}
export function writeNew(p,data) { fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600}); }
export function privatePath(p,directory=false) {
  const s=fs.lstatSync(p);
  if(s.uid!==process.getuid?.() || (s.mode&0o777)!==(directory?0o700:0o600) || (directory?!s.isDirectory():!s.isFile()||s.nlink!==1)) throw fail('UNSAFE_ENDPOINT','Endpoint ownership, permissions or file type is invalid');
}
