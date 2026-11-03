import fs from 'node:fs';
import crypto from 'node:crypto';

export function validateRelease(config) {
  if (config.schemaVersion !== 1 || config.updateProtocol !== 1 ||
      !/^\d+\.\d+\.\d+$/.test(config.version) ||
      config.packageName !== '@petercjl/ecom-macos-arm64' ||
      config.channel !== 'latest' || config.platform !== 'darwin' ||
      config.arch !== 'arm64' || config.bundleId !== 'app.ecom.browser' ||
      config.appName !== 'Ecom.app' || config.signing !== 'ad-hoc' || config.notarized !== false) {
    throw new Error('Unsupported Ecom release contract');
  }
  return config;
}
export async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export function artifactManifest(config, sourceRevision, archiveSha256, archiveBytes) {
  validateRelease(config);
  if (!/^[a-f0-9]{40}$/.test(sourceRevision) || !/^[a-f0-9]{64}$/.test(archiveSha256) || !Number.isSafeInteger(archiveBytes) || archiveBytes <= 0) throw new Error('Invalid artifact identity');
  return { ...config, sourceRevision, archive: 'Ecom.tar.xz', archiveSha256, archiveBytes };
}
export function payloadPackage(config) {
  validateRelease(config);
  return { name: config.packageName, version: config.version, description: 'Ecom native macOS arm64 application payload', license: 'MPL-2.0', os: ['darwin'], cpu: ['arm64'], files: ['Ecom.tar.xz', 'artifact.json', 'LICENSE'], publishConfig: { access: 'public' }, repository: { type: 'git', url: 'git+https://github.com/petercjl/ecom.git' } };
}
