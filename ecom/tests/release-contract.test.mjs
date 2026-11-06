import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareReleaseSource } from '../build-macos.mjs';
import { validatePublication, verifyPayload } from '../verify-release-payload.mjs';
import { auditMacBundle, verifyMacArchitecture, packNativePayload } from '../package-macos.mjs';
import { verifyDevValidation } from '../publication-evidence.mjs';
import { registryPayloadStatus } from '../registry-payload-status.mjs';
import crypto from 'node:crypto';
import { artifactManifest, payloadPackage, validateRelease, sha256 } from '../release-contract.mjs';
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
  assert.deepEqual(pkg.files, ['Ecom.tar.xz', 'artifact.json', 'LICENSE']);
  assert.equal(pkg.scripts, undefined); assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(pkg.os, ['darwin']); assert.deepEqual(pkg.cpu, ['arm64']);
  assert.equal(pkg.publishConfig.access, 'public');
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../distribution/package.json', import.meta.url))), pkg);
});
test('direct latest requires bound Dev evidence and automated package checks', () => {
  const record = { version: config.version, packageName: config.packageName, platform: 'darwin', arch: 'arm64', sourceRevision: 'a'.repeat(40), tarballSha256: 'b'.repeat(64), updaterSelfTest: true, codesignVerified: true, nativeSmokeTest: false, localUpdateRecoveryVerified: false, updateRoundTripVerified: false, evidencePath: 'docs/ecom/release-evidence/macos-0.1.0.md', devValidation: { verified: true, sourceRevision: 'a'.repeat(40), evidencePath: 'docs/ecom/release-evidence/dev.md' } };
  assert.equal(validatePublication(record, config), record);
  assert.equal(validatePublication(record, config, 'next'), record);
  for (const patch of [{ devValidation: undefined }, { devValidation: { ...record.devValidation, verified: false } }, { devValidation: { ...record.devValidation, sourceRevision: 'HEAD' } }, { updaterSelfTest: false }, { codesignVerified: false }, { sourceRevision: 'HEAD' }, { evidencePath: '/tmp/uncommitted.md' }, { tarballSha256: '' }, { packageName: '@petercjl/ecom-cli' }]) assert.throws(() => validatePublication({ ...record, ...patch }, config));
});
test('channel promotion requires a byte-identical published version', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-registry-proof-'));
  const file = path.join(dir, 'payload.tgz'); fs.writeFileSync(file, 'fixture bytes', { flag: 'wx' });
  const absent = async () => ({ status: 404 });
  const metadata = { name: config.packageName, version: config.version, dist: { integrity: 'sha512-' + crypto.createHash('sha512').update('fixture bytes').digest('base64') } };
  try {
    assert.deepEqual(await registryPayloadStatus(config.version, file, 'next', absent), { exists: false });
    assert.deepEqual(await registryPayloadStatus(config.version, file, 'latest', absent), { exists: false });
    assert.deepEqual(await registryPayloadStatus(config.version, file, 'latest', async () => ({ ok: true, json: async () => metadata })), { exists: true });
    await assert.rejects(registryPayloadStatus(config.version, file, 'latest', async () => ({ ok: true, json: async () => ({ ...metadata, dist: { integrity: 'sha512-wrong' } }) })), /differs from the verified tarball/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('application audit refuses profile files, external links and private build paths', { skip: process.platform === 'win32' && 'macOS bundle filesystem test' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-app-audit-'));
  const app = path.join(dir, 'Ecom.app'); fs.mkdirSync(app);
  try {
    fs.writeFileSync(path.join(app, 'resource'), 'public resource', { flag: 'wx' });
    await auditMacBundle(app);
    fs.writeFileSync(path.join(app, 'Cookies'), 'fixture', { flag: 'wx' });
    await assert.rejects(auditMacBundle(app), /Runtime\/private file/); fs.unlinkSync(path.join(app, 'Cookies'));
    fs.writeFileSync(path.join(app, 'private-path'), os.homedir() + '/fixture', { flag: 'wx' });
    await assert.rejects(auditMacBundle(app), /Private build path/); fs.unlinkSync(path.join(app, 'private-path'));
    fs.symlinkSync(dir, path.join(app, 'external'), 'dir');
    await assert.rejects(auditMacBundle(app), /External application symlink/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('publication verifies an actual tarball and rejects changed transport bytes', { skip: process.platform === 'win32' && 'macOS tar payload integration test' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-payload-'));
  const repo = path.join(dir, 'repo'); fs.mkdirSync(repo);
  const run = (file, args, cwd = repo) => {
    const result = spawnSync(file, args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const write = (name, data) => { const target = path.join(repo, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data, { flag: 'wx' }); };
  try {
    run('git', ['init', '-b', 'main']); run('git', ['config', 'user.name', 'Test']); run('git', ['config', 'user.email', 'test@example.invalid']);
    write('ecom/release-config.json', JSON.stringify(config)); write('ecom/distribution/package.json', JSON.stringify(payloadPackage(config)));
    run('git', ['add', '.']); run('git', ['commit', '-m', 'Fixture source']);
    const sourceRevision = run('git', ['rev-parse', 'HEAD']);
    const stage = path.join(dir, 'stage'), pkg = path.join(stage, 'package'); fs.mkdirSync(pkg, { recursive: true });
    // Transport-only fixture: these bytes are not a native application.
    const zip = path.join(pkg, 'Ecom.tar.xz'); fs.writeFileSync(zip, 'archive fixture', { flag: 'wx' });
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify(payloadPackage(config)), { flag: 'wx' });
    fs.writeFileSync(path.join(pkg, 'artifact.json'), JSON.stringify(artifactManifest(config, sourceRevision, await sha256(zip), fs.statSync(zip).size)), { flag: 'wx' });
    fs.writeFileSync(path.join(pkg, 'LICENSE'), 'fixture', { flag: 'wx' });
    const tgz = path.join(dir, 'payload.tgz');
    run('/usr/bin/tar', ['-czf', tgz, '-C', stage, 'package/Ecom.tar.xz', 'package/LICENSE', 'package/artifact.json', 'package/package.json']);
    const evidencePath = 'docs/ecom/release-evidence/fixture.md'; write(evidencePath, 'Transport fixture source: ' + sourceRevision);
    write('ecom/releases/macos-arm64/' + config.version + '.json', JSON.stringify({ version: config.version, packageName: config.packageName, platform: 'darwin', arch: 'arm64', sourceRevision, tarballSha256: await sha256(tgz), updaterSelfTest: true, codesignVerified: true, nativeSmokeTest: false, localUpdateRecoveryVerified: false, updateRoundTripVerified: false, devValidation: { verified: true, sourceRevision, evidencePath }, evidencePath }));
    run('git', ['add', '.']); run('git', ['commit', '-m', 'Fixture evidence']);
    assert.equal((await verifyPayload(repo, config.version, tgz)).artifactVerified, true);
    const originalTarball = fs.readFileSync(tgz);
    fs.appendFileSync(tgz, 'changed transport bytes');
    await assert.rejects(verifyPayload(repo, config.version, tgz), /differs from the committed artifact/);
    fs.writeFileSync(tgz, originalTarball);
    write('ecom/test-macos-update-recovery.mjs', '// Development-only recovery verification');
    run('git', ['add', '.']); run('git', ['commit', '-m', 'Verification-only change']);
    assert.equal((await verifyPayload(repo, config.version, tgz)).artifactVerified, true);
    write('ecom/updater/EcomUpdater.swift', '// Changed production updater');
    run('git', ['add', '.']); run('git', ['commit', '-m', 'Native input change']);
    await assert.rejects(verifyPayload(repo, config.version, tgz), /Native inputs changed/);
    assert.throws(() => verifyDevValidation(repo, { platform: 'darwin', devValidation: { verified: true, sourceRevision, evidencePath } }), /Native inputs changed after Dev validation/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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

test('macOS architecture gate invokes real lipo on Mach-O input', { skip: process.platform !== 'darwin' || process.arch !== 'arm64' }, () => {
  verifyMacArchitecture(process.execPath);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-architecture-'));
  try {
    const invalid = path.join(dir, 'not-macho'); fs.writeFileSync(invalid, 'invalid', { flag: 'wx' });
    assert.throws(() => verifyMacArchitecture(invalid));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('native npm payload packs in its own package context', { skip: process.platform !== 'darwin' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-native-pack-'));
  try {
    const payload = path.join(dir, 'payload'); fs.mkdirSync(payload);
    fs.writeFileSync(path.join(payload, 'package.json'), JSON.stringify(payloadPackage(config)), { flag: 'wx' });
    for (const name of ['Ecom.tar.xz', 'artifact.json', 'LICENSE']) fs.writeFileSync(path.join(payload, name), 'fixture', { flag: 'wx' });
    packNativePayload(payload, dir);
    const tarball = path.join(dir, 'petercjl-ecom-macos-arm64-' + config.version + '.tgz');
    const result = spawnSync('/usr/bin/tar', ['-tzf', tarball], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split('\n').sort(), ['package/Ecom.tar.xz', 'package/LICENSE', 'package/artifact.json', 'package/package.json'].sort());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
