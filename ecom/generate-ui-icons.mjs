import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptName = 'ecom/ui-icons.json';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = name => fs.readFileSync(path.join(root, name));
export function checkUIIconAssets() {
  const receipt = JSON.parse(read(receiptName));
  if (receipt.sourceSha256 !== hash(read(receipt.source))) throw new Error('UI icon source changed; regenerate assets');
  for (const [name, digest] of Object.entries(receipt.outputs)) {
    if (hash(read(name)) !== digest) throw new Error('UI icon mismatch: ' + name);
  }
}
function run(file, args) {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
  return result.stdout;
}
function generate() {
  if (process.platform !== 'darwin') throw new Error('Generation requires macOS with Xcode; --check is cross-platform');
  const staging = fs.mkdtempSync(path.join(root, '.brave-build/ui-icons-'));
  const replacements = new Map();
  const files = run('git', ['ls-files']).trim().split('\n');
  const targets = [];
  for (const name of files.filter(name => /^app\/theme\/(?:default_(?:100|200)_percent\/)?brave\/product_logo.*\.png$/.test(name))) {
    const dimensions = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', name]);
    const width = Number(dimensions.match(/pixelWidth: (\d+)/)[1]);
    const height = Number(dimensions.match(/pixelHeight: (\d+)/)[1]);
    targets.push({name,width,height});
  }
  fs.writeFileSync(path.join(staging,'dimensions.json'), JSON.stringify([...new Map(targets.map(t=>[`${t.width}x${t.height}`,[t.width,t.height]])).values()]), {flag:'wx'});
  run('xcrun', ['swift', 'ecom/render-ui-icons.swift', 'assets/ecom-icon.png', staging]);
  for (const {name,width,height} of targets) replacements.set(name,fs.readFileSync(path.join(staging,`${width}x${height}.png`)));
  for (const [name, source] of [['icon.png', '64.png'], ['icon-off.png', '64-disabled.png']]) {
    replacements.set('components/brave_shields/resources/' + name, fs.readFileSync(path.join(staging, source)));
  }
  const vector = fs.readFileSync(path.join(staging, 'product.icon'));
  for (const name of ['app_menu_color', 'app_menu_outline']) replacements.set('components/vector_icons/' + name + '.icon', vector);
  for (const name of files.filter(name => /^components\/(?:omnibox\/browser\/)?vector_icons\/brave\/.*\.icon$/.test(name))) replacements.set(name, vector);
  for (const name of ['leo_brave_icon_monochrome', 'leo_brave_icon_only_face', 'leo_brave_icon_only_face_disabled']) {
    const disabled = name.endsWith('_disabled');
    replacements.set('components/vector_icons/' + name + '.icon', disabled ? Buffer.from(vector.toString().replaceAll('PATH_COLOR_ARGB, 0xFF,', 'PATH_COLOR_ARGB, 0x6B,')) : vector);
  }
  const png = fs.readFileSync(path.join(staging, '256.png')).toString('base64');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="256" height="256" viewBox="0 0 256 256"><image width="256" height="256" xlink:href="data:image/png;base64,${png}"/></svg>\n`);
  for (const name of ['app/theme/brave/product_logo.svg', 'app/theme/brave/product_logo_animation.svg', 'app/theme/brave/password_manager_logo.svg', 'components/brave_welcome_ui/components/images/lion_logo.svg']) replacements.set(name, svg);
  for (const name of ['brave-icon-monochrome', 'brave-icon-only-face', 'brave-icon-outline', 'brave-icon-release-color']) replacements.set('ui/webui/resources/images/ecom/' + name + '.svg', svg);
  const receipt = { schemaVersion: 1, source: 'assets/ecom-icon.png', sourceSha256: hash(read('assets/ecom-icon.png')), outputs: Object.fromEntries([...replacements].map(([name, bytes]) => [name, hash(bytes)])) };
  replacements.set(receiptName, Buffer.from(JSON.stringify(receipt, null, 2) + '\n'));
  const backup = fs.mkdtempSync(path.join(root, '.local-backups/ui-icon-assets-'));
  const existing = new Map();
  for (const name of replacements.keys()) {
    const target = path.join(root, name);
    if (!fs.existsSync(target)) continue;
    const info = fs.lstatSync(target);
    if (!info.isFile()) throw new Error('Expected regular asset file: ' + name);
    existing.set(name, info);
    const saved = path.join(backup, name);
    fs.mkdirSync(path.dirname(saved), { recursive: true });
    fs.copyFileSync(target, saved, fs.constants.COPYFILE_EXCL);
    if (hash(fs.readFileSync(saved)) !== hash(read(name))) throw new Error('Backup verification failed');
  }
  for (const [name, bytes] of replacements) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: existing.has(name) ? 'w' : 'wx', mode: 0o644 });
    if (fs.statSync(target).size !== bytes.length || hash(read(name)) !== hash(bytes)) throw new Error('Asset write verification failed');
  }
  checkUIIconAssets();
  console.log(JSON.stringify({ ok: true, outputs: replacements.size - 1, backup, staging }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).join(' ') === '--check') { checkUIIconAssets(); console.log(JSON.stringify({ ok: true })); }
    else if (process.argv.length === 2) generate();
    else throw new Error('Usage: node ecom/generate-ui-icons.mjs [--check]');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
