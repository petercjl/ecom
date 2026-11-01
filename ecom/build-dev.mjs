import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { canonicalRepository, git } from './workspace.mjs';

const root = canonicalRepository(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const profile = path.join(root, '.brave-build/profiles/Ecom-Dev');
const executable = path.join(root, '.brave-build/src/out', `Component${process.arch === 'x64' ? '' : '_' + process.arch}`, 'Ecom Dev.app/Contents/MacOS/Ecom Dev');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
const query = (file, args) => { const r = spawnSync(file, args, { encoding: 'utf8' }); if (r.error || r.status !== 0) throw r.error || new Error(r.stderr.trim()); return r.stdout.trim(); };

// The fixed workspace profile and executable identify only this project's Dev.
// A stale endpoint or a different Chrome/Brave process never grants quit access.
function runningDev() {
  const file = path.join(profile, 'DevToolsActivePort');
  if (!fs.existsSync(file)) return null;
  const [port, endpoint] = fs.readFileSync(file, 'utf8').trim().split('\n');
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535 || ['9223', '9224'].includes(port) || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(endpoint)) throw new Error('Dev 调试端点无效，已停止重启');
  const result = spawnSync('lsof', ['-nP', '-a', '-iTCP:' + port, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
  if (result.status === 1 && !result.stdout.trim()) return null;
  if (result.error || result.status !== 0) throw result.error || new Error('无法核对 Dev 端口的进程');
  const pids = [...new Set(result.stdout.trim().split(/\s+/).map(Number))];
  if (pids.length !== 1 || !Number.isSafeInteger(pids[0]) || pids[0] <= 0) throw new Error('Dev 端口的进程身份不明确');
  const pid = pids[0];
  const command = query('ps', ['-ww', '-p', String(pid), '-o', 'command=']);
  if (!command.startsWith(executable + ' ') || !command.split(' ').includes('--user-data-dir=' + profile) || Number(query('ps', ['-p', String(pid), '-o', 'uid='])) !== process.getuid()) throw new Error('端口未对应当前工作区的 Ecom Dev，已保留原进程');
  return { pid, port, endpoint };
}

async function quitDev(instance) {
  const socket = new WebSocket(`ws://127.0.0.1:${instance.port}${instance.endpoint}`);
  try {
    await once(socket, 'open', { signal: AbortSignal.timeout(5000) });
    const current = runningDev();
    if (current?.pid !== instance.pid || current.endpoint !== instance.endpoint) throw new Error('Dev 实例已改变，已停止退出操作');
    const closed = once(socket, 'close', { signal: AbortSignal.timeout(10000) });
    socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await closed;
  } finally { socket.close(); }
  for (let n = 0; n < 80 && alive(instance.pid); n++) await pause(250);
  if (alive(instance.pid)) throw new Error('Ecom Dev 尚未正常退出；请关闭该 Dev 窗口后重试');
}

async function main() {
  if (process.argv.includes('--help')) { console.log('用法：node ecom/build-dev.mjs\n本地增量编译成功后，正常退出并重新启动当前工作区的 Ecom Dev。当前验证平台：macOS。'); return; }
  if (process.argv.length > 2) throw new Error('不支持的参数；使用 --help 查看用法');
  if (process.platform !== 'darwin') throw new Error('此入口当前用于 macOS Dev；Windows 构建与重启流程待验证');
  const validNode = file => { const version = spawnSync(file, ['--version'], { encoding: 'utf8' }).stdout || ''; const [major, minor] = version.replace(/^v/, '').split('.').map(Number); return major === 24 && minor >= 16; };
  const node = [process.env.ECOM_NODE, process.execPath, path.join(os.homedir(), '.local/share/ecom-toolchain/node_modules/node/bin/node')].filter(Boolean).find(validNode);
  if (!node) throw new Error('需要 Node >=24.16 <25；请安装或通过 ECOM_NODE 指定');
  if (fs.realpathSync(node) !== fs.realpathSync(process.execPath)) { const result = spawnSync(node, [fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exitCode = result.status ?? 1; return; }
  const env = { ...process.env, PATH: [path.dirname(node), path.join(os.homedir(), '.local/share/ecom-toolchain/node_modules/.bin'), process.env.PATH].join(path.delimiter) };
  const selected = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' }).stdout?.trim();
  const candidates = env.DEVELOPER_DIR ? [env.DEVELOPER_DIR] : [selected, ...fs.readdirSync('/Applications').filter(name => /^Xcode.*\.app$/.test(name)).sort().reverse().map(name => path.join('/Applications', name, 'Contents/Developer'))];
  env.DEVELOPER_DIR = candidates.find(dir => dir && fs.existsSync(path.join(dir, 'usr/bin/xcodebuild')));
  if (!env.DEVELOPER_DIR) throw new Error('需要完成首次启动的完整 Xcode；可通过 DEVELOPER_DIR 指定');
  if (git(root, ['status', '--porcelain'])) throw new Error('请先按项目工作树规则提交源码改动，再运行构建重启脚本');
  const base = git(root, ['rev-parse', 'HEAD']);
  const buildRoot = path.join(root, '.brave-build'); fs.mkdirSync(buildRoot, { recursive: true });
  const runDir = fs.mkdtempSync(path.join(buildRoot, 'dev-restart-'));
  const lock = path.join(buildRoot, 'build-dev.lock');
  if (fs.existsSync(lock)) {
    const info = fs.lstatSync(lock); if (!info.isFile()) throw new Error('构建锁不是普通文件，已保留现场');
    const previous = JSON.parse(fs.readFileSync(lock, 'utf8'));
    if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0 || alive(previous.pid)) throw new Error('已有构建重启任务或锁身份不明确，已停止重复执行');
    fs.renameSync(lock, path.join(runDir, 'stale-lock.json'));
  }
  const identity = { pid: process.pid, id: crypto.randomUUID() };
  fs.writeFileSync(lock, JSON.stringify(identity), { flag: 'wx', mode: 0o600 });
  try {
    console.log('开始本地增量编译 Ecom Dev…');
    await new Promise((resolve, reject) => {
      const child = spawn(node, [path.join(root, 'ecom/workspace.mjs'), 'build', 'Component', '--target_arch', process.arch, '--use_remoteexec', 'false', '--offline'], { cwd: root, env, stdio: 'inherit' });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('编译未成功，未执行 Dev 退出或重启动作')));
    });
    if (git(root, ['rev-parse', 'HEAD']) !== base || git(root, ['status', '--porcelain'])) throw new Error('编译期间源码已变化，保留当前 Dev；提交后重新构建');
    const previous = runningDev();
    if (previous) { console.log('编译成功，正在正常退出 Ecom Dev…'); await quitDev(previous); }
    const log = path.join(runDir, 'start.log');
    if (fs.existsSync(log)) throw new Error('启动日志已存在');
    const fd = fs.openSync(log, 'wx', 0o600);
    const child = spawn(node, [path.join(root, 'ecom/workspace.mjs'), 'start', 'Component', '--no-first-run', '--no-default-browser-check', '--restore-last-session', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'], { cwd: root, env, stdio: ['ignore', fd, fd], detached: true });
    child.on('error', () => {}); child.unref(); fs.closeSync(fd);
    for (let n = 0; n < 480; n++) {
      const current = runningDev();
      if (current && current.pid !== previous?.pid) { console.log(JSON.stringify({ ok: true, sourceRevision: base, pid: current.pid, profile, log })); return; }
      if (child.exitCode !== null) throw new Error('Dev 启动未成功，请查看启动日志：' + log);
      await pause(250);
    }
    throw new Error('Dev 尚未就绪，请查看启动日志：' + log);
  } finally {
    if (JSON.parse(fs.readFileSync(lock, 'utf8')).id === identity.id) fs.renameSync(lock, path.join(runDir, 'finished-lock.json'));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
