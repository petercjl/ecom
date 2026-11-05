import fs from 'node:fs';
import { sha256 } from './release-contract.mjs';
export { sha256 };
export function validateWindowsRelease(value) {
  if (value.schemaVersion !== 1 || value.updateProtocol !== 1 ||
      !/^\d+\.\d+\.\d+$/.test(value.version) || value.packageName !== '@petercjl/ecom-windows-x64' ||
      value.channel !== 'latest' || value.platform !== 'win32' || value.arch !== 'x64' ||
      value.appName !== 'Ecom.exe' || value.signing !== 'unsigned') throw new Error('Unsupported Windows release identity');
  return value;
}
export function windowsPackage(config) {
  validateWindowsRelease(config);
  return { name: config.packageName, version: config.version, description: 'Ecom native Windows x64 application payload', license: 'MPL-2.0', os: ['win32'], cpu: ['x64'], files: ['artifact.json', 'LICENSE'], publishConfig: { access: 'public' }, repository: { type: 'git', url: 'git+https://github.com/petercjl/ecom.git' } };
}
export function readWindowsConfig(root) { return validateWindowsRelease(JSON.parse(fs.readFileSync(new URL('windows-release-config.json', root.endsWith('/') ? root : root + '/'), 'utf8'))); }

export const windowsPartBytes = 50_000_000;
export const windowsPackBudget = 70_000_000;
export function windowsPartPackage(config,index) {
  if(!Number.isInteger(index)||index<0||index>=8)throw new Error('Invalid Windows part index');
  return {...windowsPackage(config),version:config.version+'-payload.'+index,description:'Ecom Windows x64 immutable payload part',files:['EcomSetup.part','part.json','LICENSE']};
}
export function validateWindowsParts(artifact) {
  if(artifact.payloadFormat!=='npm-parts-v1'||!Array.isArray(artifact.parts)||artifact.parts.length<1||artifact.parts.length>8)throw new Error('Unsupported Windows payload layout');
  let total=0;
  artifact.parts.forEach((p,index)=>{
    if(p.index!==index||p.version!==artifact.version+'-payload.'+index||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>windowsPartBytes||
      !/^[a-f0-9]{64}$/.test(p.sha256)||!/^[a-f0-9]{64}$/.test(p.tarballSha256)||!/^sha512-[A-Za-z0-9+/]{86}==$/.test(p.integrity)||
      !Number.isSafeInteger(p.tarballBytes)||p.tarballBytes<1||p.tarballBytes>windowsPackBudget)throw new Error('Invalid immutable Windows part');
    total+=p.bytes;
  });
  if(total!==artifact.archiveBytes||total>390_000_000)throw new Error('Windows part lengths do not match installer');
  return artifact;
}
