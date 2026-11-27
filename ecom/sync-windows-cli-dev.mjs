import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const host = 'peter-new';
const remoteProject = 'E:/codex/测试';
const remoteRoot = remoteProject + '/.ecom-cli-candidates';
const transferRoot = 'E:/ecom-build-x64/repo/.brave-build/cli-candidates';
const remoteDevProfile = 'E:/ecom-build-x64/repo/.brave-build/profiles/Ecom-Dev';
const windowsNode = 'E:/ecom-build-x64/node-v24.22.2-win-x64/node.exe';
const self = fileURLToPath(import.meta.url);
const repo = path.dirname(path.dirname(self));
const name = '@lumyne/ecom-cli';
const sha512 = file => createHash('sha512').update(fs.readFileSync(file)).digest('hex');
const projectPolicy = `# Ecom CLI 候选包调试

在本项目中使用 Ecom CLI 时，每次开始测试前读取项目根目录下的 \`.ecom-cli-candidates/CURRENT.json\`。加载其中 \`skill\` 指向的候选 Skill，应用 \`environment\` 中的环境变量，用 \`node\` 字段指定的程序执行 \`entry\` 指向的候选 CLI。报告当前候选 \`revision\` 后继续测试。测试 Ecom Dev 时使用其中的 \`devProfile\`，测试正式版时使用正式浏览器。
`;

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {encoding: 'utf8', windowsHide: true, timeout: 120000, ...options});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${bin} exited with ${result.status}`);
  return result.stdout.trim();
}

function sshPowerShell(script) {
  const encoded = Buffer.from("$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; " + script, 'utf16le').toString('base64');
  return run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host,
    'powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
}

function activate(revision, digest, uploadName) {
  if (process.platform !== 'win32' || os.hostname().toLowerCase() !== host ||
      !/^[0-9a-f]{40}$/.test(revision) || !/^[0-9a-f]{128}$/.test(digest) ||
      !/^incoming-[0-9a-f-]{36}$/.test(uploadName)) throw new Error('Invalid Windows candidate activation');
  const root = path.resolve(remoteRoot);
  const upload = path.join(path.resolve(transferRoot), uploadName);
  const tarball = path.join(upload, 'candidate.tgz');
  if (sha512(tarball) !== digest) throw new Error('Uploaded CLI archive has the wrong SHA-512');

  const id = revision.slice(0, 12) + '-' + digest.slice(0, 12);
  const candidate = path.join(root, id);
  const target = path.join(candidate, 'skill', 'ecom-cli');
  const entry = path.join(target, '.runtime', 'bin', 'ecom-cli.mjs');
  const devProfile = path.resolve(remoteDevProfile);
  const pointer = path.join(root, 'CURRENT.json');
  const record = path.join(candidate, 'candidate.json');
  const temporary = path.join(upload, 'CURRENT.json');
  const lockPath = path.join(root, '.activate.lock');
  const lock = fs.openSync(lockPath, 'wx');
  const env = {...process.env, ECOM_CLI_STATE_DIR: path.join(candidate, 'state'), ECOM_CLI_UPDATE_CHECK: '0'};
  const installedArgs = ['skill', 'status', '--agent', 'codex', '--target', target, '--json'];
  let created = false;
  try {
    if (!fs.existsSync(candidate)) {
      fs.mkdirSync(candidate);
      created = true;
      const bootstrap = path.join(upload, 'bootstrap');
      const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
      run(process.execPath, [npm, 'install', '--prefix', bootstrap, '--registry=https://registry.npmjs.org',
        '--ignore-scripts', '--no-audit', '--no-fund', tarball], {cwd: upload});
      const bootstrapEntry = path.join(bootstrap, 'node_modules', '@lumyne', 'ecom-cli', 'bin', 'ecom-cli.mjs');
      run(process.execPath, [bootstrapEntry, 'skill', 'install', '--agent', 'codex', '--target', target, '--json'], {env});
      fs.copyFileSync(tarball, path.join(candidate, 'candidate.tgz'), fs.constants.COPYFILE_EXCL);
      const manifest = fs.readFileSync(path.join(target, '.runtime', 'package.json'), 'utf8');
      const {version} = JSON.parse(manifest);
      fs.writeFileSync(record, JSON.stringify({schemaVersion: 1, id, package: name, version, revision, sha512: digest,
        node: process.execPath, entry, skill: path.join(target, 'SKILL.md'), devProfile,
        environment: {ECOM_CLI_UPDATE_CHECK: '0', ECOM_CLI_STATE_DIR: env.ECOM_CLI_STATE_DIR}}, null, 2) + '\n',
      {flag: 'wx'});
    }
    const current = JSON.parse(fs.readFileSync(record, 'utf8'));
    if (current.id !== id || current.revision !== revision || current.sha512 !== digest ||
        sha512(path.join(candidate, 'candidate.tgz')) !== digest) throw new Error('Existing candidate identity differs');
    const version = JSON.parse(run(process.execPath, [entry, 'version', '--json'], {env}));
    const status = JSON.parse(run(process.execPath, [entry, ...installedArgs], {env}));
    if (version.package !== name || version.version !== current.version ||
        !status.current || !status.verification?.verified) throw new Error('Isolated candidate failed verification');

    // An existing pointer is owned by this workflow only if it refers to a
    // previously recorded candidate. Its immutable descriptor remains available.
    if (fs.existsSync(pointer)) {
      if (!fs.lstatSync(pointer).isFile()) throw new Error('Unexpected candidate pointer type');
      const previous = JSON.parse(fs.readFileSync(pointer, 'utf8'));
      if (!/^[0-9a-f]{12}-[0-9a-f]{12}$/.test(previous.id ?? '') ||
          !fs.existsSync(path.join(root, previous.id, 'candidate.json'))) throw new Error('Unmanaged candidate pointer');
    }
    const smoke = spawnSync(process.execPath, [entry, 'doctor', '--profile', devProfile, '--json'],
      {encoding: 'utf8', windowsHide: true, timeout: 20000, env});
    let diagnosis;
    try { diagnosis = JSON.parse(smoke.stdout); } catch { diagnosis = null; }
    const published = {...current, devConnection: diagnosis?.ok ? 'connected' : diagnosis?.error?.code ?? 'unverified'};
    fs.writeFileSync(temporary, JSON.stringify(published, null, 2) + '\n', {flag: 'wx'});
    fs.renameSync(temporary, pointer);
    created = false;
    const instructions = path.join(path.resolve(remoteProject), 'AGENTS.md');
    try {
      fs.writeFileSync(instructions, projectPolicy, {flag: 'wx'});
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const projectUsesCandidate = fs.lstatSync(instructions).isFile() &&
      fs.readFileSync(instructions, 'utf8').includes('.ecom-cli-candidates/CURRENT.json');
    console.log(JSON.stringify({ok: true, pointer, instructions, projectUsesCandidate, ...published}));
  } finally {
    fs.closeSync(lock);
    fs.rmSync(lockPath);
    if (created) fs.rmSync(candidate, {recursive: true, force: true});
    fs.rmSync(upload, {recursive: true, force: true});
  }
}

function sync() {
  const packageDir = path.join(repo, 'packages', 'ecom-cli');
  const revision = run('git', ['rev-parse', 'HEAD'], {cwd: repo});
  if (run('git', ['status', '--porcelain', '--', 'packages/ecom-cli'], {cwd: repo})) {
    throw new Error('Commit the CLI changes before synchronizing a candidate');
  }
  if (sshPowerShell("[Console]::WriteLine($env:COMPUTERNAME.ToLowerInvariant())") !== host) {
    throw new Error('The SSH endpoint did not identify itself as peter-new');
  }
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-cli-sync-'));
  const upload = 'incoming-' + randomUUID();
  try {
    const [pack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', stage], {cwd: packageDir}));
    if (pack.name !== name || path.basename(pack.filename) !== pack.filename) throw new Error('Unexpected CLI archive');
    const file = path.join(stage, pack.filename);
    const digest = sha512(file);
    if (pack.integrity !== 'sha512-' + Buffer.from(digest, 'hex').toString('base64')) throw new Error('Local npm integrity mismatch');
    sshPowerShell(`$project=Get-Item -LiteralPath '${remoteProject}'; if (!$project.PSIsContainer -or ($project.Attributes -band [IO.FileAttributes]::ReparsePoint)) {throw 'Unexpected project directory'}; foreach ($root in @('${remoteRoot}', '${transferRoot}')) {if (!(Test-Path -LiteralPath $root)) {New-Item -Path $root -ItemType Directory | Out-Null}; $item=Get-Item -LiteralPath $root; if (!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {throw 'Unexpected candidate directory'}}; New-Item -Path '${transferRoot}/${upload}' -ItemType Directory | Out-Null`);
    run('scp', ['-q', '-o', 'BatchMode=yes', file, `${host}:${transferRoot}/${upload}/candidate.tgz`]);
    run('scp', ['-q', '-o', 'BatchMode=yes', self, `${host}:${transferRoot}/${upload}/sync.mjs`]);
    return sshPowerShell(`& '${windowsNode}' '${transferRoot}/${upload}/sync.mjs' --activate '${revision}' '${digest}' '${upload}'; exit $LASTEXITCODE`);
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
}

if (process.argv[2] === '--activate') activate(...process.argv.slice(3));
else if (process.argv.length === 2) console.log(sync());
else throw new Error('Usage: node ecom/sync-windows-cli-dev.mjs');
