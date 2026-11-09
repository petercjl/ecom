import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { canonicalRepository, git } from './workspace.mjs';

const root = canonicalRepository(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const profile = path.join(root, '.brave-build/profiles/Ecom-Dev');
const executable = path.join(root, '.brave-build/src/out', `Component${process.arch === 'x64' ? '' : '_' + process.arch}`, 'Ecom Dev.app/Contents/MacOS/Ecom Dev');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
const query = (file, args) => { const r = spawnSync(file, args, { encoding: 'utf8' }); if (r.error || r.status !== 0) throw r.error || new Error(r.stderr.trim()); return r.stdout.trim(); };

// Process identity is independent of a browser debugging endpoint.
export function findDevProcess(listing, expected) {
  const matches = [];
  for (const line of listing.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;
    const [, rawPid, rawUid, command] = match;
    if (!command.startsWith(expected.executable + ' ') || !command.split(' ').includes('--user-data-dir=' + expected.profile) || Number(rawUid) !== expected.uid) continue;
    const pid = Number(rawPid);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Dev 进程 ID 无效');
    matches.push({ pid, command });
  }
  if (matches.length > 1) throw new Error('发现多个相同工作区 Dev 主进程，已停止重启');
  return matches[0] || null;
}
function runningDev() {
  const instance = findDevProcess(query('ps', ['-axo', 'pid=,uid=,command=', '-ww']), { executable, profile, uid: process.getuid() });
  if (instance && query('ps', ['-p', String(instance.pid), '-o', 'comm=']) !== executable) throw new Error('Dev 可执行文件身份不匹配，已保留原进程');
  return instance;
}

async function quitDev(instance) {
  const current = runningDev();
  if (current?.pid !== instance.pid || current.command !== instance.command) throw new Error('Dev 实例已改变，已停止退出操作');
  // Chromium's POSIX handler routes SIGINT through its normal Exit() path.
  process.kill(instance.pid, 'SIGINT');
  for (let n = 0; n < 80 && alive(instance.pid); n++) await pause(250);
  if (alive(instance.pid)) throw new Error('Ecom Dev 尚未正常退出；请关闭该 Dev 窗口后重试');
}

function verifyInteractiveDev(instance) {
  if (/--(?:remote-debugging|headless|enable-automation|auto-open-devtools-for-tabs)/.test(instance.command)) throw new Error('Dev 启动参数包含调试或自动化入口');
  const listeners = spawnSync('lsof', ['-nP', '-a', '-p', String(instance.pid), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (listeners.status !== 1 || listeners.stdout.trim()) throw new Error('Dev 仍有 TCP 监听或监听检查失败，未通过普通启动验证');
  if (fs.existsSync(path.join(profile, 'DevToolsActivePort'))) throw new Error('Dev 重新生成了调试端点文件，未通过普通启动验证');
}

function prepareComponentExecutable(runDir) {
  const info = fs.lstatSync(executable);
  if (!info.isFile()) throw new Error('Dev 主程序不是普通文件，已停止启动');
  if (info.nlink <= 1) return;
  // Chromium's update clone can retain a hard link to this executable. Give
  // the Component build its own inode so dyld resolves sibling libraries from
  // the build directory rather than from a former update clone.
  const backup = path.join(runDir, 'previous-main-executable');
  const temporary = executable + '.ecom-restart-' + crypto.randomUUID();
  if (fs.existsSync(backup) || fs.existsSync(temporary)) throw new Error('Dev 主程序准备路径已存在');
  const checksum = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.copyFileSync(executable, backup, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backup, info.mode & 0o777);
  fs.copyFileSync(executable, temporary, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(temporary, info.mode & 0o777);
  if (checksum(backup) !== checksum(executable) || checksum(temporary) !== checksum(backup)) throw new Error('Dev 主程序备份校验失败');
  fs.renameSync(temporary, executable);
  if (fs.statSync(executable).nlink !== 1 || checksum(executable) !== checksum(backup)) throw new Error('Dev 主程序准备校验失败');
}

async function main() {
  if (process.argv.includes('--help')) { console.log('用法：node ecom/build-dev.mjs [--source-ref <已提交版本>] [--cdp-port=<固定端口>]\n本地增量编译成功后，正常退出并重新启动当前工作区的 Ecom Dev。当前验证平台：macOS。'); return; }
  const launchArgs = process.argv.slice(2);
  const cdpFlags = launchArgs.filter(arg => arg.startsWith('--cdp-port='));
  const port = cdpFlags[0]?.slice('--cdp-port='.length);
  if (cdpFlags.length && (cdpFlags.length !== 1 || !/^[1-9][0-9]{0,4}$/.test(port ?? '') || Number(port) > 65535)) {
    throw new Error('请用 --cdp-port=<固定端口> 指定一个 1 至 65535 的端口');
  }
  const args = launchArgs.filter(arg => !cdpFlags.includes(arg));
  if (args.length && (args.length !== 2 || args[0] !== '--source-ref' || args[1].startsWith('--'))) throw new Error('支持 --source-ref <已提交版本> 和 --cdp-port=<固定端口>；使用 --help 查看用法');
  if (process.platform !== 'darwin') throw new Error('此入口当前用于 macOS Dev；Windows 构建与重启流程待验证');
  const validNode = file => { const version = spawnSync(file, ['--version'], { encoding: 'utf8' }).stdout || ''; const [major, minor] = version.replace(/^v/, '').split('.').map(Number); return major === 24 && minor >= 16; };
  const node = [process.env.ECOM_NODE, process.execPath, path.join(os.homedir(), '.local/share/ecom-toolchain/node_modules/node/bin/node')].filter(Boolean).find(validNode);
  if (!node) throw new Error('需要 Node >=24.16 <25；请安装或通过 ECOM_NODE 指定');
  if (fs.realpathSync(node) !== fs.realpathSync(process.execPath)) { const result = spawnSync(node, [fileURLToPath(import.meta.url), ...launchArgs], { stdio: 'inherit' }); process.exitCode = result.status ?? 1; return; }
  const env = { ...process.env, PATH: [path.dirname(node), path.join(os.homedir(), '.local/share/ecom-toolchain/node_modules/.bin'), process.env.PATH].join(path.delimiter) };
  const selected = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' }).stdout?.trim();
  const candidates = env.DEVELOPER_DIR ? [env.DEVELOPER_DIR] : [selected, ...fs.readdirSync('/Applications').filter(name => /^Xcode.*\.app$/.test(name)).sort().reverse().map(name => path.join('/Applications', name, 'Contents/Developer'))];
  env.DEVELOPER_DIR = candidates.find(dir => dir && fs.existsSync(path.join(dir, 'usr/bin/xcodebuild')));
  if (!env.DEVELOPER_DIR) throw new Error('需要完成首次启动的完整 Xcode；可通过 DEVELOPER_DIR 指定');
  if (git(root, ['status', '--porcelain'])) throw new Error('请先按项目工作树规则提交源码改动，再运行构建重启脚本');
  const sourceHead = git(root, ['rev-parse', 'HEAD']);
  const base = git(root, ['rev-parse', '--verify', '--end-of-options', (args[1] || 'HEAD') + '^{commit}']);
  const selection = ['--source-ref', base];
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
      const child = spawn(node, [path.join(root, 'ecom/workspace.mjs'), 'build', 'Component', ...selection, '--target_arch', process.arch, '--use_remoteexec', 'false', '--offline'], { cwd: root, env, stdio: 'inherit' });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('编译未成功，未执行 Dev 退出或重启动作')));
    });
    if (git(root, ['rev-parse', 'HEAD']) !== sourceHead || git(root, ['status', '--porcelain'])) throw new Error('编译期间源码已变化，保留当前 Dev；提交后重新构建');
    const previous = runningDev();
    if (port) {
      const occupied = spawnSync('lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' });
      if (![0, 1].includes(occupied.status) || occupied.stdout.trim().split('\n').some(line => line && line !== 'p' + previous?.pid)) {
        throw new Error('指定 CDP 端口已被占用或无法检查，保留当前 Dev');
      }
    }
    if (previous) { console.log('编译成功，正在正常退出 Ecom Dev…'); await quitDev(previous); }
    const oldEndpoint = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(oldEndpoint)) {
      if (!fs.lstatSync(oldEndpoint).isFile()) throw new Error('旧调试端点不是普通文件，已保留现场');
      const saved = path.join(runDir, 'previous-debug-endpoint.txt');
      if (fs.existsSync(saved)) throw new Error('调试端点归档路径已存在');
      fs.renameSync(oldEndpoint, saved); fs.chmodSync(saved, 0o600);
    }
    prepareComponentExecutable(runDir);
    const log = path.join(runDir, 'start.log');
    if (fs.existsSync(log)) throw new Error('启动日志已存在');
    const fd = fs.openSync(log, 'wx', 0o600);
    const child = spawn(node, [path.join(root, 'ecom/workspace.mjs'), 'start', 'Component', ...selection, ...(port ? ['--ecom-local-cdp=' + port] : []), '--no-first-run', '--no-default-browser-check', '--restore-last-session', '--ecom-native-cli-origin=https://sycm.taobao.com', '--disable-features=DialMediaRouteProvider,MacAppCodeSignClone'], { cwd: root, env, stdio: ['ignore', fd, fd], detached: true });
    child.on('error', () => {}); child.unref(); fs.closeSync(fd);
    for (let n = 0; n < 480; n++) {
      const current = runningDev();
      if (current && current.pid !== previous?.pid) {
        await pause(2000);
        const ready = runningDev();
        if (!ready || ready.pid !== current.pid) throw new Error('Dev 启动后未保持运行');
        if (port) {
          const listeners = spawnSync('lsof', ['-nP', '-a', '-p', String(ready.pid), '-iTCP', '-sTCP:LISTEN', '-Fn'], { encoding: 'utf8' });
          if (listeners.status === 1 && !listeners.stdout.trim()) continue;
          const addresses = listeners.stdout.split('\n').filter(line => line.startsWith('n')).map(line => line.slice(1));
          try {
            if (listeners.status !== 0 || !addresses.length || addresses.some(address => address !== '127.0.0.1:' + port)) {
              throw new Error('CDP 未监听指定的本机端口');
            }
            const response = await fetch('http://127.0.0.1:' + port + '/json/version', { redirect: 'error', signal: AbortSignal.timeout(3000) });
            if (!response.ok) throw new Error('CDP 端点未就绪');
            const url = new URL((await response.json()).webSocketDebuggerUrl);
            if (url.origin !== 'ws://127.0.0.1:' + port || !/^\/devtools\/browser\/[\da-f-]+$/i.test(url.pathname)) {
              throw new Error('CDP WebSocket 地址校验失败');
            }
            fs.writeFileSync(oldEndpoint, port + '\n' + url.pathname + '\n', { flag: 'wx', mode: 0o600 });
          } catch (error) {
            await quitDev(ready);
            throw error;
          }
          console.log(JSON.stringify({ ok: true, sourceRevision: base, pid: ready.pid, profile, log, launchMode: 'cdp', debugging: true, port: Number(port) }));
          return;
        }
        verifyInteractiveDev(ready);
        console.log(JSON.stringify({ ok: true, sourceRevision: base, pid: ready.pid, profile, log, launchMode: 'interactive', debugging: false })); return;
      }
      if (child.exitCode !== null) throw new Error('Dev 启动未成功，请查看启动日志：' + log);
      await pause(250);
    }
    throw new Error('Dev 尚未就绪，请查看启动日志：' + log);
  } finally {
    if (JSON.parse(fs.readFileSync(lock, 'utf8')).id === identity.id) fs.renameSync(lock, path.join(runDir, 'finished-lock.json'));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
