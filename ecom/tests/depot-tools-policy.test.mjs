import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../workspace.mjs';
import { applyDepotToolsPolicy } from '../depot-tools-policy.mjs';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-depot-policy-'));
  const file = path.join(dir, 'gclient.py');
  const original = '# Test planner\n            dep_type = dep_value.get("dep_type")\n';
  fs.writeFileSync(file, original);
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.name', 'Ecom test']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['add', '.']); git(dir, ['commit', '-m', 'Pinned tool']);
  return { dir, file, original, revision: git(dir, ['rev-parse', 'HEAD']) };
}

test('toolchain adaptation preserves the original and is idempotent', () => {
  const { dir, file, original, revision } = fixture();
  try {
    const first = applyDepotToolsPolicy(dir, revision);
    assert.equal(first.changed, true);
    assert.equal(fs.readFileSync(first.backup, 'utf8'), original);
    const updated = fs.readFileSync(file, 'utf8');
    assert.notEqual(updated, original);
    assert.equal(applyDepotToolsPolicy(dir, revision).changed, false);
    assert.equal(fs.readFileSync(file, 'utf8'), updated);
    assert.equal(fs.readdirSync(dir).filter(name => name.includes('.ecom-original-')).length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('foreign edits and a mismatched version are preserved', () => {
  const { dir, file, original, revision } = fixture();
  try {
    assert.throws(() => applyDepotToolsPolicy(dir, '0'.repeat(40)), { code: 'PINNED_TOOLCHAIN_REQUIRED' });
    fs.appendFileSync(file, '# User edit\n');
    const edited = fs.readFileSync(file, 'utf8');
    assert.throws(() => applyDepotToolsPolicy(dir, revision), { code: 'TOOLCHAIN_LOCAL_CHANGES' });
    assert.equal(fs.readFileSync(file, 'utf8'), edited);
    assert.ok(edited.startsWith(original));
    assert.equal(fs.readdirSync(dir).filter(name => name.includes('.ecom-original-')).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
