import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function failure(code, message) { return Object.assign(new Error(message), { code }); }
export function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw failure('GIT_ERROR', result.stderr?.trim() || result.error?.message || 'Git failed');
  return result.stdout.trim();
}
function canonicalTarget(target) {
  let ancestor = path.resolve(target); const missing = [];
  while (!fs.existsSync(ancestor)) { missing.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
  return path.join(fs.realpathSync(ancestor), ...missing);
}
function sameDirectory(left, right) {
  const a = fs.statSync(left, { bigint: true }); const b = fs.statSync(right, { bigint: true });
  return a.isDirectory() && b.isDirectory() && a.dev === b.dev && a.ino === b.ino;
}
function commonDirectory(cwd) { return fs.realpathSync(git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])); }
export function canonicalRepository(cwd) { return path.dirname(commonDirectory(cwd)); }
export function workspaceStatus(repo, workspace) {
  const sourceRevision = git(repo, ['rev-parse', 'HEAD']);
  if (!fs.existsSync(workspace)) return { sourceRevision, workspace, exists: false, managed: false };
  let managed = false;
  try { managed = fs.existsSync(path.join(workspace, '.git')) && sameDirectory(git(workspace, ['rev-parse', '--show-toplevel']), workspace) && sameDirectory(commonDirectory(workspace), commonDirectory(repo)); } catch { /* An unrelated directory is not managed. */ }
  return { sourceRevision, workspace, exists: true, managed, ...(managed ? { revision: git(workspace, ['rev-parse', 'HEAD']), dirty: Boolean(git(workspace, ['status', '--porcelain'])) } : {}) };
}
export function prepareWorkspace(repo, workspace, ref = 'HEAD') {
  repo = fs.realpathSync(repo); workspace = canonicalTarget(workspace);
  if (workspace === repo || repo.startsWith(workspace + path.sep) || /[ &|<>^%]/.test(workspace)) throw failure('INVALID_WORKSPACE', 'Choose a separate build path without spaces or shell metacharacters');
  const revision = git(repo, ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}']);
  const before = workspaceStatus(repo, workspace);
  if (before.exists) {
    if (!before.managed) throw failure('UNMANAGED_WORKSPACE', 'The target belongs to another directory or repository; it was preserved');
    if (before.dirty) throw failure('WORKSPACE_MODIFIED', 'Commit or preserve local worktree changes before preparing it');
    if (before.revision !== revision) git(workspace, ['switch', '--detach', revision]);
  } else {
    fs.mkdirSync(path.dirname(workspace), { recursive: true });
    git(repo, ['worktree', 'add', '--detach', workspace, revision]);
  }
  return { ok: true, workspace, revision, changed: !before.exists || before.revision !== revision };
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true, env: { ...process.env, DEPOT_TOOLS_UPDATE: '0', PATH: [path.join(cwd, 'vendor/depot_tools/.cipd_bin'), path.join(cwd, 'vendor/depot_tools'), process.env.PATH].join(path.delimiter) } });
  if (result.error || result.status !== 0) throw failure('NATIVE_COMMAND_FAILED', result.error?.message || `Command exited with ${result.status ?? result.signal}`);
}
function runBatch(file, cwd) {
  if (process.platform === 'win32') run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', file], cwd);
  else run(file, [], cwd);
}
export function bootstrapDependencies(workspace) {
  const baseline = JSON.parse(fs.readFileSync(path.join(workspace, 'ecom/source-baseline.json'), 'utf8'));
  const pnpm = process.env.npm_execpath;
  if (!pnpm || !path.basename(pnpm).startsWith('pnpm')) throw failure('PNPM_REQUIRED', 'Invoke bootstrap through pnpm run ecom:bootstrap');
  run(process.execPath, [pnpm, 'install', '--frozen-lockfile', '--yes'], workspace);
  const depot = path.join(workspace, 'vendor/depot_tools');
  const guard = depot + '_install.guard';
  if (fs.existsSync(depot)) {
    if (git(depot, ['rev-parse', 'HEAD']) !== baseline.dependencies.depotTools) throw failure('DEPENDENCY_REVISION_MISMATCH', 'Existing depot_tools differs from the pinned revision; preserve it for review');
    const marker = path.join(depot, '.disable_auto_update');
    if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() !== baseline.dependencies.depotTools) throw failure('DEPENDENCY_CONFIG_MODIFIED', 'Existing dependency configuration was preserved');
    // Finish an interrupted bootstrap using the existing checkout and downloads.
    if (fs.existsSync(guard)) {
      if (process.platform === 'win32') {
        runBatch(path.join(depot, 'cipd_bin_setup.bat'), workspace);
        runBatch(path.join(depot, 'bootstrap/win_tools.bat'), workspace);
      } else runBatch(path.join(depot, 'ensure_bootstrap'), workspace);
      const archived = guard + '.completed-' + Date.now();
      if (fs.existsSync(archived)) throw failure('RECOVERY_TARGET_EXISTS', 'Recovery record already exists');
      fs.renameSync(guard, archived);
    }
    if (!fs.existsSync(marker)) fs.writeFileSync(marker, baseline.dependencies.depotTools + '\n', { flag: 'wx' });
  }
  // This initializes fixed dependencies; the Ecom source worktree is never fetched from Brave.
  run(process.execPath, [path.join(workspace, 'build/commands/scripts/sync.ts'), '--no-history', '--nohooks'], workspace);
}
export function developmentStartArgs(repo, args) {
  if (args.some(arg => arg === '--enable_brave_update' || arg.startsWith('--enable_brave_update='))) throw failure('ECOM_UPDATE_CHANNEL', 'Ecom updates use its own release channel');
  if (args.some(arg => /^--(?:remote-debugging(?:-|=|$)|headless(?:=|$)|enable-automation(?:=|$)|auto-open-devtools-for-tabs(?:=|$))/.test(arg))) throw failure('ECOM_INTERACTIVE_ONLY', 'Ecom currently starts as an interactive browser without remote debugging or automation launch options');
  const cdpFlags = args.filter(arg => arg === '--ecom-local-cdp' || arg.startsWith('--ecom-local-cdp='));
  const port = cdpFlags[0]?.slice('--ecom-local-cdp='.length);
  if (cdpFlags.length && (cdpFlags.length !== 1 || !/^[1-9][0-9]{0,4}$/.test(port ?? '') || Number(port) > 65535)) {
    throw failure('ECOM_CDP_PORT', 'Specify one fixed CDP port from 1 to 65535');
  }
  args = args.filter(arg => !cdpFlags.includes(arg));
  const customProfile = args.some(arg => arg === '--user-data-dir' || arg.startsWith('--user-data-dir=') || arg === '--user_data_dir_name' || arg.startsWith('--user_data_dir_name='));
  if (port && customProfile) throw failure('ECOM_CDP_PROFILE', 'Local CDP uses the workspace Dev profile');
  if (port) args.push('--remote-debugging-port=' + port);
  return customProfile ? args : [...args, '--user-data-dir=' + path.join(repo, '.brave-build/profiles/Ecom-Dev')];
}
async function main() {
  const args = process.argv.slice(2); const command = args.shift() || 'status';
  let sourceRef = 'HEAD';
  const refIndex = args.indexOf('--source-ref');
  if (refIndex !== -1) {
    if (!args[refIndex + 1] || args[refIndex + 1].startsWith('--') || args.lastIndexOf('--source-ref') !== refIndex) throw failure('INVALID_SOURCE_REF', 'Supply one committed --source-ref');
    sourceRef = args.splice(refIndex, 2)[1];
  }
  const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repo = canonicalRepository(moduleRoot);
  const workspace = path.join(repo, '.brave-build/src/brave');
  if (command === 'status') return workspaceStatus(repo, workspace);
  if (!['prepare', 'bootstrap', 'build', 'start'].includes(command)) throw failure('UNKNOWN_COMMAND', 'Use prepare, status, bootstrap, build or start');
  if (git(repo, ['status', '--porcelain'])) throw failure('SOURCE_MODIFIED', 'Commit source changes before preparing a reproducible build worktree');
  const result = prepareWorkspace(repo, workspace, sourceRef);
  if (command === 'prepare') return result;
  if (command === 'bootstrap') bootstrapDependencies(workspace);
  else if (command === 'build') run(process.execPath, [path.join(workspace, 'build/commands/scripts/build.ts'), ...args], workspace);
  else run(process.execPath, [path.join(workspace, 'build/commands/scripts/commands.js'), 'start', ...developmentStartArgs(repo, args)], workspace);
  return { ok: true, command, workspace, revision: result.revision };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ ok: false, code: error.code || 'FAILED', message: error.message }) + '\n'); process.exitCode = 1;
  });
}
