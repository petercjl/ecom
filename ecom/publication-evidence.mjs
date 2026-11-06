// Publication policy only; application payload identity remains immutable.
import { git } from './workspace.mjs';
const evidencePath = /^docs\/ecom\/release-evidence\/[a-zA-Z0-9._-]+\.md$/;
export function validateDevValidation(record) {
  const dev = record.devValidation;
  if (dev?.verified !== true || !/^[a-f0-9]{40}$/.test(dev.sourceRevision) ||
      !evidencePath.test(dev.evidencePath)) throw new Error('Dev validation evidence is incomplete');
  return dev;
}
const publicationFiles = new Set([
  'AGENTS.md', 'ecom/publication-evidence.mjs', 'ecom/verify-release-payload.mjs',
  'ecom/verify-windows-payload.mjs', 'ecom/registry-payload-status.mjs',
  'ecom/windows-release-transfer.mjs', 'ecom/test-macos-update-recovery.mjs',
  'ecom/tests/release-contract.test.mjs', 'ecom/tests/windows-release-contract.test.mjs',
  'ecom/tests/windows-updater-local-roundtrip.cs', 'ecom/tests/windows-updater-ui.cs',
  '.github/workflows/ecom-macos-publish.yml', '.github/workflows/ecom-windows-publish.yml',
]);
export function publicationOnly(file, platform) {
  return publicationFiles.has(file) || file.startsWith('docs/') ||
    file.startsWith('packages/ecom-cli/') || file.startsWith('ecom/releases/') ||
    // This translation unit is included only by the Windows build.
    (platform === 'darwin' && file === 'browser/ecom/windows_update_service.cc');
}
export function verifyDevValidation(root, record) {
  const dev = validateDevValidation(record);
  git(root, ['cat-file', '-e', dev.sourceRevision + '^{commit}']);
  const evidence = git(root, ['show', 'HEAD:' + dev.evidencePath]);
  if (!evidence.includes(dev.sourceRevision)) throw new Error('Dev source missing from committed evidence');
  const changes = git(root, ['diff', '--name-only', dev.sourceRevision, 'HEAD']).split(/\r?\n/).filter(Boolean);
  if (changes.some(file => !publicationOnly(file, record.platform)))
    throw new Error('Native inputs changed after Dev validation');
}
