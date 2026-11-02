import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareReleaseSource } from '../build-macos.mjs';
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
test('release source excludes concurrent edits and refuses modified managed source', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-release-source-'));
  const repo = path.join(dir, 'repo'), workspace = path.join(dir, 'build/src/brave');
  fs.mkdirSync(repo);
  const git = args => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  try {
    git(['init', '-b', 'main']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(path.join(repo, 'source.txt'), 'committed', { flag: 'wx' });
    git(['add', 'source.txt']); git(['commit', '-m', 'Source']);
    const revision = git(['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(repo, 'source.txt'), 'concurrent work');
    const selected = prepareReleaseSource(repo, workspace);
    assert.equal(selected.revision, revision); assert.equal(selected.rootHasUncommittedChanges, true);
    assert.equal(fs.readFileSync(path.join(workspace, 'source.txt'), 'utf8'), 'committed');
    assert.equal(fs.readFileSync(path.join(repo, 'source.txt'), 'utf8'), 'concurrent work');
    fs.writeFileSync(path.join(workspace, 'source.txt'), 'local build edit');
    assert.throws(() => prepareReleaseSource(repo, workspace), /Commit or preserve/);
    assert.equal(fs.readFileSync(path.join(workspace, 'source.txt'), 'utf8'), 'local build edit');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
