import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Passing a known commit avoids gclient fetching all remote refs for a local tag.
// Keep the original ref when the dependency has not been checked out yet.
export function resolveLocalDependencyRevision(checkout, ref) {
  if (!fs.existsSync(path.join(checkout, '.git'))) return ref;
  const result = spawnSync('git', ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'], {
    cwd: checkout, encoding: 'utf8', windowsHide: true,
  });
  const revision = result.stdout?.trim();
  return result.status === 0 && /^[a-f0-9]{40}$/.test(revision) ? revision : ref;
}
