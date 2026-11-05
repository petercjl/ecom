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
  return { name: config.packageName, version: config.version, description: 'Ecom native Windows x64 application payload', license: 'MPL-2.0', os: ['win32'], cpu: ['x64'], files: ['EcomSetup.exe', 'artifact.json', 'LICENSE'], publishConfig: { access: 'public' }, repository: { type: 'git', url: 'git+https://github.com/petercjl/ecom.git' } };
}
export function readWindowsConfig(root) { return validateWindowsRelease(JSON.parse(fs.readFileSync(new URL('windows-release-config.json', root.endsWith('/') ? root : root + '/'), 'utf8'))); }
