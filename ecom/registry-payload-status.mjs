import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRelease } from './release-contract.mjs';

export async function registryPayloadStatus(version, tarball, tag, fetchMetadata = fetch) {
  const config = validateRelease(JSON.parse(fs.readFileSync(new URL('./release-config.json', import.meta.url))));
  if (version !== config.version || !['next', 'latest'].includes(tag) || !tarball) throw new Error('Invalid release target');
  const response = await fetchMetadata('https://registry.npmjs.org/@petercjl%2fecom-macos-arm64/' + version, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (response.status === 404) {
    if (tag === 'latest') throw new Error('Publish and verify the candidate on next before promotion');
    return { exists: false };
  } else {
    if (!response.ok) throw new Error('Cannot verify the public registry version');
    const metadata = await response.json(); const checksum = crypto.createHash('sha512');
    for await (const chunk of fs.createReadStream(tarball)) checksum.update(chunk);
    if (metadata.name !== config.packageName || metadata.version !== version || metadata.dist?.integrity !== 'sha512-' + checksum.digest('base64')) throw new Error('Published version differs from the verified tarball; preserve both and investigate');
    return { exists: true };
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  registryPayloadStatus(...process.argv.slice(2)).then(result => console.log('exists=' + result.exists)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
