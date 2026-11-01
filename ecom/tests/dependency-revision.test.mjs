import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../workspace.mjs';
import { resolveLocalDependencyRevision } from '../dependency-revision.mjs';

test('a local pinned tag resolves to its commit independently of the current branch', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-dependency-'));
  try {
    git(dir, ['init', '-b', 'main']);
    git(dir, ['config', 'user.name', 'Ecom test']);
    git(dir, ['config', 'user.email', 'test@example.invalid']);
    git(dir, ['commit', '--allow-empty', '-m', 'Pinned dependency']);
    const pinned = git(dir, ['rev-parse', 'HEAD']);
    git(dir, ['tag', '-a', 'pinned', '-m', 'Pinned version']);
    git(dir, ['commit', '--allow-empty', '-m', 'Later change']);
    assert.notEqual(git(dir, ['rev-parse', 'HEAD']), pinned);
    assert.equal(resolveLocalDependencyRevision(dir, 'refs/tags/pinned'), pinned);
    assert.equal(resolveLocalDependencyRevision(dir, pinned), pinned);
    assert.equal(resolveLocalDependencyRevision(dir, 'refs/tags/not-downloaded'), 'refs/tags/not-downloaded');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an initial checkout retains its ref without inheriting a parent repository', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-dependency-'));
  try {
    git(dir, ['init', '-b', 'main']);
    git(dir, ['config', 'user.name', 'Ecom test']);
    git(dir, ['config', 'user.email', 'test@example.invalid']);
    git(dir, ['commit', '--allow-empty', '-m', 'Parent repository']);
    const child = path.join(dir, 'dependency');
    fs.mkdirSync(child);
    assert.equal(resolveLocalDependencyRevision(child, 'HEAD'), 'HEAD');
    assert.equal(resolveLocalDependencyRevision(path.join(dir, 'missing'), 'refs/tags/pinned'), 'refs/tags/pinned');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
