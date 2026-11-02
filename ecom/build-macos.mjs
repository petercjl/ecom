import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalRepository, git, prepareWorkspace } from './workspace.mjs';
import { packageMacos } from './package-macos.mjs';

const root = canonicalRepository(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
export function prepareReleaseSource(repo, workspace) {
  if (git(repo, ['branch', '--show-current']) !== 'main') throw new Error('Integrate release source on main before building');
  const revision = git(repo, ['rev-parse', 'HEAD']);
  // Only committed files enter the managed source. Concurrent root edits are
  // preserved and cannot be consumed by the compiler or packaging steps.
  const prepared = prepareWorkspace(repo, workspace, revision);
  return { ...prepared, rootHasUncommittedChanges: Boolean(git(repo, ['status', '--porcelain'])) };
}
async function main() {
  if (process.argv.includes('--help')) {
    console.log('node ecom/build-macos.mjs [--prepare-only] [--wait]\nBuild the committed macOS arm64 release, then prepare DMG and npm payload. --wait queues behind the active native build. Does not quit Dev, install or publish.'); return;
  }
  const args = process.argv.slice(2);
  if (new Set(args).size !== args.length || args.some(arg => !['--prepare-only', '--wait'].includes(arg))) throw new Error('Unsupported argument');
  const prepareOnly = args.includes('--prepare-only');
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This entry currently targets macOS arm64');
  const node = [process.env.ECOM_NODE, process.execPath, path.join(os.homedir(), '.local/share/ecom-toolchain/node_modules/node/bin/node')].filter(Boolean).find(file => /^v24\.(?:1[6-9]|[2-9]\d)\./.test(spawnSync(file, ['--version'], { encoding: 'utf8' }).stdout || ''));
  if (!node) throw new Error('Node >=24.16 <25 is required');
  if (fs.realpathSync(node) !== fs.realpathSync(process.execPath)) {
    const child = spawnSync(node, [fileURLToPath(import.meta.url), ...args], { stdio: 'inherit' }); process.exitCode = child.status ?? 1; return;
  }
  if (git(root, ['branch', '--show-current']) !== 'main') throw new Error('Integrate release source on main before building');
  if (git(root, ['diff', '--name-only', 'HEAD', '--', 'ecom/build-macos.mjs', 'ecom/workspace.mjs', 'ecom/package-macos.mjs', 'ecom/release-contract.mjs'])) throw new Error('Commit release build entry changes before execution');
  const revision = git(root, ['rev-parse', 'HEAD']);
  const env = { ...process.env, PATH: [path.dirname(node), path.join(os.homedir(), '.local/share/ecom-toolchain/node_modules/.bin'), process.env.PATH].join(path.delimiter) };
  const selected = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' }).stdout?.trim();
  const candidates = env.DEVELOPER_DIR ? [env.DEVELOPER_DIR] : [selected, ...fs.readdirSync('/Applications').filter(name => /^Xcode.*\.app$/.test(name)).sort().reverse().map(name => path.join('/Applications', name, 'Contents/Developer'))];
  env.DEVELOPER_DIR = candidates.find(dir => dir && fs.existsSync(path.join(dir, 'usr/bin/xcodebuild')));
  if (!env.DEVELOPER_DIR) throw new Error('Full Xcode is required');
  process.env.DEVELOPER_DIR = env.DEVELOPER_DIR;
  const buildRoot = path.join(root, '.brave-build'); fs.mkdirSync(buildRoot, { recursive: true });
  const runDir = fs.mkdtempSync(path.join(buildRoot, 'mac-release-'));
  // The same lock protects both configurations and the shared managed source.
  const lock = path.join(buildRoot, 'build-dev.lock');
  if (args.includes('--wait')) {
    let announced = false;
    while (fs.existsSync(lock)) {
      let owner;
      try {
        if (!fs.lstatSync(lock).isFile()) throw new Error('Unknown build lock preserved');
        owner = JSON.parse(fs.readFileSync(lock, 'utf8'));
      } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Unknown build lock preserved');
      let live = true; try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') live = false; else throw e; }
      if (!live) break;
      if (!announced) { console.log('Waiting for the active native build; committed main will be selected after the lock is released.'); announced = true; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  if (fs.existsSync(lock)) {
    if (!fs.lstatSync(lock).isFile()) throw new Error('Unknown build lock preserved');
    const previous = JSON.parse(fs.readFileSync(lock, 'utf8'));
    if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0) throw new Error('Unknown build lock preserved');
    let live = true; try { process.kill(previous.pid, 0); } catch (e) { if (e.code === 'ESRCH') live = false; else throw e; }
    if (live) throw new Error('Another native build is running');
    fs.renameSync(lock, path.join(runDir, 'stale-lock.json'));
  }
  const identity = { pid: process.pid, id: crypto.randomUUID(), configuration: 'Release_arm64' };
  fs.writeFileSync(lock, JSON.stringify(identity), { flag: 'wx', mode: 0o600 });
  try {
    if (git(root, ['rev-parse', 'HEAD']) !== revision) return { retry: true };
    const workspace = path.join(buildRoot, 'src/brave');
    const source = prepareReleaseSource(root, workspace);
    if (source.revision !== revision) throw new Error('Main changed during source preparation');
    const log = path.join(runDir, 'build.log');
    if (fs.existsSync(log)) throw new Error('Build log exists');
    const fd = fs.openSync(log, 'wx', 0o600);
    console.log(JSON.stringify({ revision, log, mode: prepareOnly ? 'prepare' : 'build', output: 'Release_arm64', restartsDev: false, rootHasUncommittedChanges: source.rootHasUncommittedChanges }));
    const buildArgs = [path.join(workspace, 'build/commands/scripts/build.ts'), 'Release', '--target_arch', 'arm64', '--channel', 'release', '--skip_signing', '--use_remoteexec', 'false', '--offline', '--gn', 'is_official_build:false', '--gn', 'chrome_pgo_phase:0', '--gn', 'use_thin_lto:false', '--gn', 'enable_updater:false', '--gn', 'enable_sparkle:false', '--gn', 'enable_update_notifications:false'];
    if (prepareOnly) buildArgs.push('--prepare_only');
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(node, buildArgs, { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
        for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { fs.writeSync(fd, chunk); process.stdout.write(chunk); });
        child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Release build failed; Dev was preserved. Log: ' + log)));
      });
    } finally { fs.closeSync(fd); }
    if (git(root, ['rev-parse', 'HEAD']) !== revision) return { retry: true };
    if (prepareOnly) { console.log(JSON.stringify({ prepared: true, revision, log, compiled: false })); return; }
    const result = await packageMacos({ sourceApp: path.join(buildRoot, 'src/out/Release_arm64/Ecom.app'), output: path.join(runDir, 'artifacts'), sourceRevision: revision, sourceRoot: workspace });
    if (git(root, ['rev-parse', 'HEAD']) !== revision) return { retry: true };
    console.log(JSON.stringify({ ok: true, sourceRevision: revision, ...result }));
  } finally {
    if (JSON.parse(fs.readFileSync(lock, 'utf8')).id === identity.id) fs.renameSync(lock, path.join(runDir, 'finished-lock.json'));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => {
    if (result?.retry) {
      console.log('Main advanced; continuing incrementally from the latest committed source with existing outputs preserved.');
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
      process.exitCode = child.status ?? 1;
    }
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
