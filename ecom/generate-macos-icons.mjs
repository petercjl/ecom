import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceName = 'assets/ecom-icon.png';
const receiptName = 'ecom/macos-icons.json';
const targets = ['app/theme/brave/mac/app.icns', 'app/theme/brave/mac/Assets.car',
  'app/theme/brave/mac/development/app.icns', 'app/theme/brave/mac/development/Assets.car'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = name => fs.readFileSync(path.join(root, name));

export function checkMacIconAssets() {
  const receipt = JSON.parse(read(receiptName));
  if (receipt.schemaVersion !== 1 || receipt.source !== sourceName || receipt.sourceSha256 !== hash(read(sourceName))) throw new Error('Mac icon source changed; regenerate the icon assets');
  for (const name of targets) {
    if (receipt.outputs[name] !== hash(read(name))) throw new Error(`Mac icon asset changed: ${name}`);
  }
  return receipt;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function generate() {
  if (process.platform !== 'darwin') throw new Error('Generate Mac icons on macOS with full Xcode selected through DEVELOPER_DIR');
  const source = read(sourceName);
  if (!source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || source.readUInt32BE(16) !== source.readUInt32BE(20) || source.readUInt32BE(16) < 1024) throw new Error('Use the approved square PNG at 1024 pixels or larger');
  const stagingRoot = path.join(root, '.brave-build');
  fs.mkdirSync(stagingRoot, { recursive: true });
  const staging = fs.mkdtempSync(path.join(stagingRoot, 'mac-icons-'));
  const iconset = path.join(staging, 'Ecom.iconset');
  const catalog = path.join(staging, 'Ecom.xcassets');
  const appIcon = path.join(catalog, 'AppIcon.appiconset');
  const compiled = path.join(staging, 'compiled');
  for (const dir of [iconset, appIcon, compiled]) fs.mkdirSync(dir, { recursive: true });
  const images = [];
  for (const points of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const filename = `icon_${points}x${points}${scale === 2 ? '@2x' : ''}.png`;
      const output = path.join(iconset, filename);
      if (fs.existsSync(output)) throw new Error('Unexpected staging output');
      run('sips', ['--resampleHeightWidth', String(points * scale), String(points * scale), path.join(root, sourceName), '--out', output]);
      fs.copyFileSync(output, path.join(appIcon, filename), fs.constants.COPYFILE_EXCL);
      images.push({ idiom: 'mac', size: `${points}x${points}`, scale: `${scale}x`, filename });
    }
  }
  fs.writeFileSync(path.join(appIcon, 'Contents.json'), JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2), { flag: 'wx' });
  fs.writeFileSync(path.join(catalog, 'Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 } }), { flag: 'wx' });
  run('xcrun', ['iconutil', '--convert', 'icns', '--output', path.join(staging, 'app.icns'), iconset]);
  run('xcrun', ['actool', '--compile', compiled, '--platform', 'macosx', '--minimum-deployment-target', '13.0', '--app-icon', 'AppIcon', '--output-partial-info-plist', path.join(staging, 'compiled-info.plist'), catalog]);
  const icns = fs.readFileSync(path.join(staging, 'app.icns'));
  const car = fs.readFileSync(path.join(compiled, 'Assets.car'));
  const assetInfo = JSON.parse(run('xcrun', ['assetutil', '--info', path.join(compiled, 'Assets.car')]));
  if (!assetInfo.some(item => item.Name?.startsWith('AppIcon'))) throw new Error('Compiled asset catalog has no AppIcon');
  const receipt = { schemaVersion: 1, source: sourceName, sourceSha256: hash(source), xcode: run('xcodebuild', ['-version']), outputs: Object.fromEntries(targets.map(name => [name, hash(name.endsWith('.icns') ? icns : car)])) };
  const replacements = new Map(targets.map(name => [name, name.endsWith('.icns') ? icns : car]));
  replacements.set(receiptName, Buffer.from(JSON.stringify(receipt, null, 2) + '\n'));
  const backupRoot = path.join(root, '.local-backups');
  fs.mkdirSync(backupRoot, { recursive: true });
  const backup = fs.mkdtempSync(path.join(backupRoot, 'mac-icons-'));
  const existing = new Map();
  for (const name of replacements.keys()) {
    const target = path.join(root, name);
    if (!fs.existsSync(target)) continue;
    const info = fs.lstatSync(target);
    if (!info.isFile()) throw new Error(`Expected a regular asset file: ${name}`);
    existing.set(name, info);
    const preserved = path.join(backup, name);
    fs.mkdirSync(path.dirname(preserved), { recursive: true });
    fs.copyFileSync(target, preserved, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(preserved, info.mode & 0o777);
    if (hash(fs.readFileSync(preserved)) !== hash(fs.readFileSync(target))) throw new Error('Icon backup verification failed');
  }
  for (const [name, bytes] of replacements) {
    const target = path.join(root, name);
    fs.writeFileSync(target, bytes, { flag: existing.has(name) ? 'w' : 'wx', mode: 0o644 });
    if (hash(fs.readFileSync(target)) !== hash(bytes)) throw new Error(`Icon write verification failed: ${name}`);
  }
  checkMacIconAssets();
  return { ok: true, changed: true, staging: path.relative(root, staging), backup: path.relative(root, backup), outputs: targets };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) console.log('Generate Ecom macOS ICNS and AppIcon asset catalogs from assets/ecom-icon.png. Requires full Xcode.\nOptions: --check (validate existing outputs), --force (regenerate).');
    else if (args.some(arg => !['--check', '--force'].includes(arg))) throw new Error('Unknown option; use --help');
    else if (args.includes('--check')) { checkMacIconAssets(); console.log(JSON.stringify({ ok: true, source: sourceName, outputs: targets })); }
    else {
      let current = false;
      try { checkMacIconAssets(); current = true; } catch { /* A changed source needs regeneration. */ }
      console.log(JSON.stringify(current && !args.includes('--force') ? { ok: true, changed: false } : generate()));
    }
  } catch (error) { console.error(JSON.stringify({ ok: false, message: error.message })); process.exitCode = 1; }
}
