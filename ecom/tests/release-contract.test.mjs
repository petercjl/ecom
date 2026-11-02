import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { artifactManifest, payloadPackage, validateRelease } from '../release-contract.mjs';
const config = JSON.parse(fs.readFileSync(new URL('../release-config.json', import.meta.url)));
test('release artifact pins native source, payload hash and supported target', () => {
  const result = artifactManifest(config, 'a'.repeat(40), 'b'.repeat(64), 1234);
  assert.equal(result.sourceRevision, 'a'.repeat(40));
  assert.equal(result.archiveSha256, 'b'.repeat(64));
  for (const patch of [{ bundleId: 'app.ecom.browser.dev' }, { channel: 'next' }, { arch: 'x64' }, { version: '0.1.0-beta' }, { updateProtocol: 2 }]) assert.throws(() => validateRelease({ ...config, ...patch }));
  assert.throws(() => artifactManifest(config, 'HEAD', 'b'.repeat(64), 1234));
});
test('binary payload has an explicit allowlist and no install scripts or runtime dependency', () => {
  const pkg = payloadPackage(config);
  assert.deepEqual(pkg.files, ['Ecom.zip', 'artifact.json', 'LICENSE']);
  assert.equal(pkg.scripts, undefined); assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(pkg.os, ['darwin']); assert.deepEqual(pkg.cpu, ['arm64']);
  assert.equal(pkg.publishConfig.access, 'public');
});
