import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validateRelease, payloadPackage, sha256 } from './release-contract.mjs';
import { git } from './workspace.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function validatePublication(record, config, tag = 'latest') {
  validateRelease(config);
  if (record.version !== config.version || record.packageName !== config.packageName ||
      record.platform !== config.platform || record.arch !== config.arch ||
      !['latest', 'next'].includes(tag) || record.nativeSmokeTest !== true || record.localUpdateRecoveryVerified !== true ||
      (tag === 'latest' && record.updateRoundTripVerified !== true) ||
      !/^[a-f0-9]{40}$/.test(record.sourceRevision) || !/^[a-f0-9]{64}$/.test(record.tarballSha256) ||
      !/^docs\/ecom\/release-evidence\/[a-zA-Z0-9._-]+\.md$/.test(record.evidencePath)) throw new Error('Native release evidence is incomplete');
  return record;
}
export async function verifyPayload(repositoryRoot, version, tgz, tag = 'latest') {
  const root = repositoryRoot;
  const config = validateRelease(JSON.parse(fs.readFileSync(path.join(root, 'ecom/release-config.json'), 'utf8')));
  if (version !== config.version) throw new Error('Release input must match the committed version');
  const descriptor = JSON.parse(fs.readFileSync(path.join(root, 'ecom/distribution/package.json'), 'utf8'));
  if (JSON.stringify(descriptor) !== JSON.stringify(payloadPackage(config))) throw new Error('Distribution descriptor differs from release config');
  const recordPath = path.join(root, 'ecom/releases/macos-arm64', version + '.json');
  if (!fs.existsSync(recordPath)) throw new Error('Native release record is missing; complete installation and update validation before publishing');
  const record = validatePublication(JSON.parse(fs.readFileSync(recordPath, 'utf8')), config, tag);
  git(root, ['cat-file', '-e', record.sourceRevision + '^{commit}']);
  const evidence = git(root, ['show', 'HEAD:' + record.evidencePath]);
  if (!evidence.includes(record.sourceRevision)) throw new Error('Evidence does not identify the native build source');
  // Unknown application or recipe changes select a new build rather than reuse.
  const changes = git(root, ['diff', '--name-only', record.sourceRevision, 'HEAD']).split('\n').filter(Boolean);
  const managerOnly = file => file.startsWith('docs/') || file.startsWith('packages/ecom-cli/') || file.startsWith('ecom/releases/') || file === 'AGENTS.md' || file === '.github/workflows/ecom-macos-publish.yml' || file === 'ecom/verify-release-payload.mjs';
  if (changes.some(file => !managerOnly(file))) throw new Error('Native inputs changed after the verified artifact; build again');
  if (!tgz) return { ok: true, version, record, artifactVerified: false };
  if (await sha256(tgz) !== record.tarballSha256) throw new Error('Payload differs from the committed artifact');
  const tar = args => {
    const r = spawnSync('/usr/bin/tar', args, { encoding: 'utf8', maxBuffer: 1_000_000 });
    if (r.error || r.status !== 0) throw new Error('Invalid payload archive'); return r.stdout;
  };
  const entries = tar(['-tzf', tgz]).trim().split('\n').sort();
  if (JSON.stringify(entries) !== JSON.stringify(['package/Ecom.zip', 'package/LICENSE', 'package/artifact.json', 'package/package.json'].sort())) throw new Error('Unexpected package contents');
  const pkg = JSON.parse(tar(['-xOzf', tgz, 'package/package.json']));
  if (pkg.name !== config.packageName || pkg.version !== config.version || pkg.scripts || pkg.dependencies) throw new Error('Unexpected package identity or executable scripts');
  const manifest = JSON.parse(tar(['-xOzf', tgz, 'package/artifact.json']));
  for (const [key, value] of Object.entries(config)) if (manifest[key] !== value) throw new Error('Artifact contract differs: ' + key);
  if (manifest.sourceRevision !== record.sourceRevision || manifest.archive !== 'Ecom.zip' || !/^[a-f0-9]{64}$/.test(manifest.archiveSha256) || !Number.isSafeInteger(manifest.archiveBytes) || manifest.archiveBytes <= 0) throw new Error('Invalid native artifact identity');
  const checksum = crypto.createHash('sha256'); let bytes = 0;
  await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/tar', ['-xOzf', tgz, 'package/Ecom.zip'], { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', chunk => { checksum.update(chunk); bytes += chunk.length; });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Cannot read application archive')));
  });
  if (checksum.digest('hex') !== manifest.archiveSha256 || bytes !== manifest.archiveBytes) throw new Error('Application archive checksum mismatch');
  return { ok: true, version, record, artifactVerified: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { positionals, values } = parseArgs({ options: { tag: { type: 'string', default: 'latest' } }, allowPositionals: true });
  verifyPayload(root, positionals[0], positionals[1], values.tag).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
