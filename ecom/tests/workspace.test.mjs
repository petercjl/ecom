import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git, prepareWorkspace, workspaceStatus, developmentStartArgs } from '../workspace.mjs';
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-git-'));
  git(dir, ['init', '-b', 'main']); git(dir, ['config', 'user.name', 'Ecom test']); git(dir, ['config', 'user.email', 'test@example.invalid']);
  fs.writeFileSync(path.join(dir, '.gitignore'), '.build/\n'); fs.writeFileSync(path.join(dir, 'source.txt'), 'one');
  git(dir, ['add', '.']); git(dir, ['commit', '-m', 'Initial source']);
  return { dir, workspace: path.join(dir, '.build/src/brave') };
}
test('a managed worktree prepares, repeats without changes and advances to an Ecom commit', () => {
  const { dir, workspace } = fixture();
  try {
    const initial = git(dir, ['rev-parse', 'HEAD']);
    assert.equal(prepareWorkspace(dir, workspace).changed, true);
    assert.equal(workspaceStatus(dir, workspace).managed, true);
    if (process.platform === 'win32') assert.equal(workspaceStatus(dir.toLowerCase(), workspace.toUpperCase()).managed, true);
    assert.equal(prepareWorkspace(dir, workspace).changed, false);
    fs.writeFileSync(path.join(dir, 'source.txt'), 'two'); git(dir, ['add', 'source.txt']); git(dir, ['commit', '-m', 'Ecom change']);
    assert.equal(prepareWorkspace(dir, workspace).changed, true);
    assert.notEqual(workspaceStatus(dir, workspace).revision, initial);
    assert.equal(fs.readFileSync(path.join(workspace, 'source.txt'), 'utf8'), 'two');
    assert.equal(git(dir, ['remote']), '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('local worktree edits are retained and block a preparation', () => {
  const { dir, workspace } = fixture();
  try {
    prepareWorkspace(dir, workspace); fs.writeFileSync(path.join(workspace, 'source.txt'), 'local edit');
    assert.throws(() => prepareWorkspace(dir, workspace), { code: 'WORKSPACE_MODIFIED' });
    assert.equal(fs.readFileSync(path.join(workspace, 'source.txt'), 'utf8'), 'local edit');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('unmanaged directories and repositories are preserved', () => {
  const { dir, workspace } = fixture();
  try {
    fs.mkdirSync(workspace, { recursive: true }); fs.writeFileSync(path.join(workspace, 'user.txt'), 'keep');
    assert.throws(() => prepareWorkspace(dir, workspace), { code: 'UNMANAGED_WORKSPACE' });
    git(workspace, ['init']);
    assert.throws(() => prepareWorkspace(dir, workspace), { code: 'UNMANAGED_WORKSPACE' });
    assert.equal(fs.readFileSync(path.join(workspace, 'user.txt'), 'utf8'), 'keep');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('unsafe paths and an unknown revision refuse before filesystem creation', () => {
  const { dir, workspace } = fixture();
  try {
    assert.throws(() => prepareWorkspace(dir, dir), { code: 'INVALID_WORKSPACE' });
    assert.throws(() => prepareWorkspace(dir, workspace, 'missing-revision'), { code: 'GIT_ERROR' });
    assert.equal(fs.existsSync(workspace), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('native development launch selects an Ecom profile and keeps its update channel', () => {
  const repo = path.resolve('ecom-source');
  const result = developmentStartArgs(repo, ['Component']);
  assert.ok(result.includes('--user-data-dir=' + path.join(repo, '.brave-build/profiles/Ecom-Dev')));
  assert.deepEqual(developmentStartArgs(repo, ['--user-data-dir=explicit-dev-profile']), ['--user-data-dir=explicit-dev-profile']);
  assert.throws(() => developmentStartArgs(repo, ['--enable_brave_update']), { code: 'ECOM_UPDATE_CHANNEL' });
});
