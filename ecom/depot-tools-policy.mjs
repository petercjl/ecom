import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const baseline = JSON.parse(fs.readFileSync(new URL('./source-baseline.json', import.meta.url), 'utf8'));
const normalize = text => text.replace(/\r\n/g, '\n');
const fail = (code, message) => Object.assign(new Error(message), { code });

// The pinned gclient applies custom_deps exclusions to Git, but not CIPD.
// Apply the same explicit exclusion before a CIPD package enters the plan.
export function applyDepotToolsPolicy(depot, expectedRevision = baseline.dependencies.depotTools) {
  const git = args => execFileSync('git', args, { cwd: depot, encoding: 'utf8', windowsHide: true });
  if (git(['rev-parse', 'HEAD']).trim() !== expectedRevision) throw fail('PINNED_TOOLCHAIN_REQUIRED', 'Verify the pinned depot_tools revision before applying Ecom policy');
  const file = path.join(depot, 'gclient.py');
  const metadata = fs.lstatSync(file);
  if (!metadata.isFile()) throw fail('TOOLCHAIN_FILE_TYPE', 'The gclient source must be a regular file');
  const current = fs.readFileSync(file, 'utf8');
  const original = normalize(git(['show', 'HEAD:gclient.py']));
  const needle = '            dep_type = dep_value.get("dep_type")\n';
  if (original.split(needle).length !== 2) throw fail('TOOLCHAIN_INCOMPATIBLE', 'Review the dependency planner before updating Ecom policy');
  const patched = original.replace(needle, needle + '            if dep_type == "cipd" and self.get_custom_deps(name, "") is None:\n                continue\n');
  if (normalize(current) === patched) return { changed: false, file };
  if (normalize(current) !== original) throw fail('TOOLCHAIN_LOCAL_CHANGES', 'Local gclient edits were preserved; review them before applying Ecom policy');
  const backup = file + '.ecom-original-' + Date.now() + '-' + process.pid;
  if (fs.existsSync(backup)) throw fail('BACKUP_EXISTS', 'The toolchain recovery path already exists');
  fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  if (fs.readFileSync(backup, 'utf8') !== current) throw fail('BACKUP_FAILED', 'The toolchain backup could not be verified');
  const output = current.includes('\r\n') ? patched.replace(/\n/g, '\r\n') : patched;
  fs.writeFileSync(file, output);
  if (fs.readFileSync(file, 'utf8') !== output || fs.statSync(file).mode !== metadata.mode) throw fail('POLICY_WRITE_FAILED', 'Verify the toolchain file and its recovery backup: ' + backup);
  return { changed: true, file, backup };
}
