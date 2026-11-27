import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fail} from '../common.mjs';

const win = path.win32;

function powershell(script, environment = {}) {
  const executable = win.join(process.env.SystemRoot ?? 'C:\\Windows',
    'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const prelude = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; $ErrorActionPreference = "Stop"; ';
  return execFileSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(prelude + script, 'utf16le').toString('base64')], {
    encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, ...environment},
  }).trim();
}

export function windowsMailboxPath(file, directory = false) {
  const stat = fs.lstatSync(file);
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) {
    throw fail('UNSAFE_ENDPOINT', 'Windows mailbox entry has an invalid file type or link count');
  }
}

function checkEndpoint(folder) {
  const endpoint = win.join(folder, 'endpoint.json');
  windowsMailboxPath(folder, true);
  windowsMailboxPath(endpoint);
  const result = powershell(String.raw`
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $paths = @($env:ECOM_MAILBOX_CHECK, (Join-Path $env:ECOM_MAILBOX_CHECK 'endpoint.json'))
    for ($i = 0; $i -lt $paths.Count; $i++) {
      $item = Get-Item -Force -LiteralPath $paths[$i]
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { 'unsafe'; exit }
      $acl = Get-Acl -LiteralPath $paths[$i]
      $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
      if ($rules.Count -ne 1 -or $rules[0].IdentityReference -ne $sid -or
          $rules[0].AccessControlType -ne 'Allow' -or $rules[0].FileSystemRights -ne 'FullControl') { 'unsafe'; exit }
      if ($i -eq 0 -and (!$acl.AreAccessRulesProtected -or
          $acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $sid -or $rules[0].IsInherited -or
          [int]$rules[0].InheritanceFlags -ne 3 -or [int]$rules[0].PropagationFlags -ne 0)) { 'unsafe'; exit }
      if ($i -eq 1 -and (!$rules[0].IsInherited -or [int]$rules[0].InheritanceFlags -ne 0)) { 'unsafe'; exit }
    }
    'private'
  `, {ECOM_MAILBOX_CHECK: folder});
  if (result !== 'private') throw fail('UNSAFE_ENDPOINT', 'Windows mailbox access is not restricted to the browser user');
}

function normalized(file) {
  return win.resolve(file).toLowerCase();
}

export function windowsInstanceCandidates(rows, {profile, instance} = {}, env = process.env) {
  const installed = new Set([env.LOCALAPPDATA, env.ProgramFiles, env['ProgramFiles(x86)']]
    .filter(Boolean).map(dir => normalized(win.join(dir, 'Ecom', 'Application', 'Ecom.exe'))));
  const candidates = [];
  for (const {ProcessId: pid, ExecutablePath: executable, CommandLine: command} of rows) {
    if (!Number.isSafeInteger(pid) || !executable || !command) continue;
    if (/(?:^|[\s"])--(?:type(?:=|[\s"])|remote-debugging|headless|enable-automation)/i.test(command)) continue;
    const namedDev = win.basename(executable).toLowerCase() === 'ecom dev.exe';
    const dev = namedDev || /(?:^|[\s"])--ecom-dev(?=$|[\s"])/i.test(command);
    if (dev ? !profile && !instance : !installed.has(normalized(executable))) continue;
    const explicit = command.match(/(?:^|\s)"--user-data-dir=([^"]+)"|(?:^|\s)--user-data-dir=(?:"([^"]+)"|([^"\s]+))/i);
    const run = win.dirname(win.dirname(executable));
    const root = win.dirname(run);
    const namedProfile = win.basename(root) === '.brave-build' && win.basename(run).startsWith('windows-dev-')
      ? win.join(root, 'profiles', 'Ecom-Dev')
      : env.LOCALAPPDATA && win.join(env.LOCALAPPDATA, 'Ecom Dev', 'User Data');
    const selected = namedDev ? namedProfile : explicit?.slice(1).find(Boolean) ??
      (!dev && env.LOCALAPPDATA ? win.join(env.LOCALAPPDATA, 'Ecom', 'User Data') : null);
    if (!selected || !win.isAbsolute(selected) || (profile && normalized(selected) !== normalized(profile))) continue;
    candidates.push({pid, executable, profile: selected, channel: dev ? 'dev' : 'stable'});
  }
  return candidates;
}

export function discoverWindows(options) {
  let processes;
  try {
    processes = JSON.parse(powershell(String.raw`
      $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      $rows = @(Get-CimInstance Win32_Process -Filter "Name = 'Ecom.exe' OR Name = 'Ecom Dev.exe'" | ForEach-Object {
        if ($_.ExecutablePath -and $_.CommandLine -and
            $_.CommandLine -notmatch '(?:^|[\s"])--type(?:=|[\s"])' -and
            (Invoke-CimMethod -InputObject $_ -MethodName GetOwnerSid).Sid -eq $sid) {
          $_ | Select-Object ProcessId, ExecutablePath, CommandLine
        }
      })
      ConvertTo-Json -Compress -InputObject $rows
    `));
  } catch {
    throw fail('INSTANCE_DISCOVERY_FAILED', 'Could not enumerate Ecom processes for the current Windows user');
  }
  const candidates = [];
  for (const candidate of windowsInstanceCandidates(processes, options)) {
    const folder = win.join(candidate.profile, 'Default', '.ecom-native-cli');
    const file = win.join(folder, 'endpoint.json');
    if (!fs.existsSync(file)) continue;
    try {
      checkEndpoint(folder);
    } catch {
      throw fail('UNSAFE_ENDPOINT', 'Could not verify the Windows Ecom mailbox ownership, permissions or file type');
    }
    const endpoint = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (endpoint.product !== 'Ecom' || endpoint.schemaVersion !== 1 ||
        endpoint.pid !== candidate.pid || typeof endpoint.executable !== 'string' ||
        normalized(endpoint.executable) !== normalized(candidate.executable) ||
        typeof endpoint.userDataDir !== 'string' ||
        normalized(endpoint.userDataDir) !== normalized(candidate.profile) ||
        !/^[\da-f-]{36}$/.test(endpoint.instanceId) ||
        !/^[\da-f-]{36}$/.test(endpoint.authToken) ||
        (options.instance && endpoint.instanceId !== options.instance)) continue;
    candidates.push({folder, endpoint, channel: candidate.channel});
  }
  return candidates;
}
