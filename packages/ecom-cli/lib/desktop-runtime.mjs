import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {exists, fail, root} from './common.mjs';
import {discover} from './browser.mjs';

export function desktopFiles(platform = process.platform, arch = process.arch) {
  if (!['darwin', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch)) return null;
  const bin = `bin/agent-desktop-${platform}-${arch}${platform === 'win32' ? '.exe' : ''}`;
  const helper = platform === 'darwin' ? `bin/agent-desktop-macos-helper-darwin-${arch}` : null;
  return {bin, helper, files: ['package.json', bin, ...(helper ? [helper] : [])]};
}

// Follow npm's ancestor layout, including hoisted dependencies. A managed Skill
// resolves only inside its own runtime, even if a bootstrap install is present.
export function desktopDependency(base = root, platform = process.platform, arch = process.arch) {
  const layout = desktopFiles(platform, arch);
  if (!layout) return null;
  const version = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8')).dependencies?.['agent-desktop'];
  if (!version) return null;
  for (let current = base; ; current = path.dirname(current)) {
    const directory = path.join(current, 'node_modules', 'agent-desktop');
    const manifest = path.join(directory, 'package.json');
    if (exists(manifest)) {
      const installed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (installed.name !== 'agent-desktop' || installed.version !== version ||
          !layout.files.every(file => fs.statSync(path.join(directory, file), {throwIfNoEntry: false})?.isFile())) break;
      return {...layout, directory, version};
    }
    if (path.basename(base) === '.runtime' || current === path.dirname(current)) break;
  }
  throw fail('DESKTOP_DEPENDENCY_UNAVAILABLE', 'Restore the pinned agent-desktop dependency by reinstalling Ecom CLI or updating the selected Skill from an intact npm installation.');
}

export function createDesktop(session) {
  const dependency = desktopDependency();
  if (!dependency) throw fail('PLATFORM_UNSUPPORTED', 'Desktop shop navigation requires macOS or Windows on arm64 or x64.');
  const env = {...process.env};
  delete env.AGENT_DESKTOP_AGENT_ID;
  if (dependency.helper) env.AGENT_DESKTOP_MACOS_HELPER_PATH = path.join(dependency.directory, dependency.helper);
  const executable = path.join(dependency.directory, dependency.bin);
  return (command, ...args) => {
    const result = spawnSync(executable, [command, ...args, '--session', session], {
      env, encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    });
    const executed = ['click', 'mouse-click', 'launch', 'focus-window'].includes(command) ? 'unknown' : false;
    if (result.error) {
      const code = result.error.code;
      throw fail('DESKTOP_RUNTIME_FAILED', `agent-desktop could not complete ${command} (${code ?? 'spawn error'}).`,
        {executed: ['ENOENT', 'EACCES'].includes(code) ? false : executed});
    }
    let reply;
    try { reply = JSON.parse(result.stdout); } catch {}
    if (result.status !== 0 || reply?.ok !== true) {
      const {code, disposition} = reply?.error ?? {};
      throw fail('DESKTOP_OPERATION_FAILED', `agent-desktop could not complete ${command}.`, {
        desktopCode: code,
        executed: disposition?.delivery === 'not_delivered' ? false : executed,
        diagnostics: {command, desktopCode: code ?? null},
      });
    }
    return reply.data;
  };
}

export function selectDesktopInstance(options, platform = process.platform, resolve = discover) {
  if (options.profile === undefined && options.instance === undefined) return null;
  if (platform !== 'darwin') {
    throw fail('PLATFORM_UNSUPPORTED', 'Explicit desktop instance selection is currently supported on macOS.');
  }
  const {endpoint, channel} = resolve(options, {allowFixedDevCdp: true});
  return {id: endpoint.instanceId, pid: endpoint.pid, channel};
}

export function ecomDesktop(run, {instance = null, platform = process.platform, env = process.env} = {}) {
  const app = platform === 'win32' ? 'Ecom.exe' :
    instance?.channel === 'dev' ? 'app.ecom.browser.dev' : 'app.ecom.browser';
  const windowsInstallations = platform === 'win32'
    ? [env.LOCALAPPDATA, env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean)
      .map(directory => path.win32.join(directory, 'Ecom', 'Application', 'Ecom.exe'))
    : [];
  const installedWindowsExecutables = new Set(windowsInstallations.map(file => file.toLowerCase()));
  function formalWindowsPids() {
    const powershell = path.win32.join(env.SystemRoot ?? env.windir ?? 'C:\\Windows',
      'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' +
      'ConvertTo-Json -Compress -InputObject @(Get-Process -Name Ecom -ErrorAction SilentlyContinue | Select-Object Id,Path)';
    const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script],
      {encoding: 'utf8', timeout: 5000, windowsHide: true});
    if (result.status !== 0) throw fail('STABLE_ECOM_DISCOVERY_FAILED', 'Could not verify the Ecom.exe executable in the current Windows session.');
    return new Set(JSON.parse(result.stdout).filter(process =>
      installedWindowsExecutables.has(process.Path?.toLowerCase())).map(process => process.Id));
  }
  return {
    instance,
    ...(platform === 'win32' ? {
      focus(window) {
        return run('focus-window', '--app', app, '--window-id', window.id, '--headed');
      },
      clickPoint(x, y) {
        return run('mouse-click', `--xy=${x},${y}`, '--headed');
      },
    } : {}),
    listWindows() {
      let windows;
      try { windows = run('list-windows', '--app', app); }
      catch (error) {
        if (['APP_NOT_FOUND', 'WINDOW_NOT_FOUND'].includes(error.desktopCode)) return [];
        throw error;
      }
      if (instance) return windows.filter(window => window.pid === instance.pid);
      if (platform !== 'win32' || !windows.length) return windows;
      const pids = formalWindowsPids();
      return windows.filter(window => pids.has(window.pid));
    },
    launch() {
      const target = platform === 'win32'
        ? windowsInstallations.find(file => fs.statSync(file, {throwIfNoEntry: false})?.isFile())
        : app;
      if (!target) throw fail('STABLE_ECOM_NOT_FOUND', 'No formal Ecom installation was found in the standard Windows installation locations.');
      run('launch', target, '--activate', '--timeout', '12000');
    },
    snapshot(window, depth = 40, bounds = false) {
      return run('snapshot', '--app', app, '--window-id', window.id, '--max-depth', String(depth),
        '--timeout-ms', '8000', ...(bounds ? ['--include-bounds'] : []));
    },
    click(ref, headed = false) {
      return headed ? run('click', ref, '--headed') : run('click', ref);
    },
  };
}
