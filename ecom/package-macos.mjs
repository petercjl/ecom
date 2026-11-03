import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { artifactManifest, payloadPackage, sha256, validateRelease } from './release-contract.mjs';
import { git } from './workspace.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || command + ' failed');
  return result.stdout.trim();
}
function writeNew(file, contents) {
  if (fs.existsSync(file)) throw new Error('Output already exists: ' + file);
  fs.writeFileSync(file, contents, { flag: 'wx' });
}
export function packNativePayload(payload, output) {
  const npm = fs.realpathSync(run('/usr/bin/which', ['npm']));
  run(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', output], { cwd: payload });
}
export function verifyMacArchitecture(executable) {
  run('/usr/bin/lipo', [executable, '-verify_arch', 'arm64']);
}
export async function auditMacBundle(app) {
  const forbidden = new Set(['.git', '.npmrc', '.env', 'Cookies', 'Login Data', 'Local State', 'Preferences', 'History', 'DevToolsActivePort']);
  const privatePaths = [...new Set([os.homedir() + '/', root + '/'])].map(value => Buffer.from(value));
  const overlap = Math.max(...privatePaths.map(value => value.length)) - 1;
  async function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (forbidden.has(entry.name)) throw new Error('Runtime/private file in application: ' + path.relative(app, file));
      if (entry.isSymbolicLink()) {
        if (!fs.realpathSync(file).startsWith(app + path.sep)) throw new Error('External application symlink');
      } else if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        let tail = Buffer.alloc(0);
        for await (const chunk of fs.createReadStream(file)) {
          const data = Buffer.concat([tail, chunk]);
          if (privatePaths.some(value => data.includes(value))) throw new Error('Private build path embedded in application: ' + path.relative(app, file));
          tail = data.subarray(Math.max(0, data.length - overlap));
        }
      } else throw new Error('Unsupported application file type');
    }
  }
  await visit(app);
}
export function signMacBundle(app, sourceRoot = root) {
  const chromiumApp = fs.existsSync(path.join(sourceRoot, '../chrome/app/app-entitlements.plist')) ? path.resolve(sourceRoot, '../chrome/app') : path.join(sourceRoot, '.brave-build/src/chrome/app');
  const entries = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { visit(file); entries.push({ file, directory: true }); }
      else if (entry.isFile()) entries.push({ file, directory: false });
    }
  }
  visit(app);
  const machoMagic = new Set(['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca']);
  for (const entry of entries) {
    if (entry.directory) {
      if (!/\.(app|framework|xpc)$/.test(entry.file)) continue;
    } else {
      const fd = fs.openSync(entry.file, 'r'); const bytes = Buffer.alloc(4);
      try { if (fs.readSync(fd, bytes, 0, 4, 0) !== 4 || !machoMagic.has(bytes.toString('hex'))) continue; }
      finally { fs.closeSync(fd); }
    }
    const args = ['--force', '--sign', '-', '--preserve-metadata=entitlements,flags,runtime'];
    if (entry.directory && entry.file.endsWith('.app')) {
      const template = entry.file.endsWith('(Renderer).app') ? 'helper-renderer-entitlements.plist' : entry.file.endsWith('(GPU).app') ? 'helper-gpu-entitlements.plist' : null;
      if (template) args.push('--entitlements', path.join(chromiumApp, template));
    }
    run('/usr/bin/codesign', [...args, entry.file]);
  }
  run('/usr/bin/codesign', ['--force', '--sign', '-', '--entitlements', path.join(chromiumApp, 'app-entitlements.plist'), app]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
}
async function shareHelperResources(app, output, version) {
  const framework = path.join(app, 'Contents/Frameworks/Ecom Framework.framework/Versions', version);
  const resource = 'brave_resources.pak';
  const canonical = path.join(framework, 'Resources', resource);
  const helpers = path.join(framework, 'Helpers');
  const original = fs.lstatSync(canonical);
  const hash = await sha256(canonical);
  for (const helper of fs.readdirSync(helpers)) {
    if (!/^Ecom Helper \(Aperitif(?: Alerts| GPU| Renderer)?\)\.app$/.test(helper)) continue;
    const copy = path.join(helpers, helper, 'Contents/Resources', resource);
    const info = fs.lstatSync(copy);
    if (!original.isFile() || !info.isFile() || info.size !== original.size ||
        info.mode !== original.mode || await sha256(copy) !== hash) {
      throw new Error('Unexpected helper resource: ' + helper);
    }
    if (info.ino === original.ino && info.dev === original.dev) continue;
    // Keep the helper's bundle-relative path while sharing the sealed bytes.
    fs.renameSync(copy, path.join(output, helper + '.' + resource));
    fs.linkSync(canonical, copy);
  }
}

export async function packageMacos({ sourceApp, output, sourceRevision, sourceRoot = root }) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Currently verified target: macOS arm64');
  const config = validateRelease(JSON.parse(fs.readFileSync(path.join(sourceRoot, 'ecom/release-config.json'), 'utf8')));
  if (fs.existsSync(output)) throw new Error('Choose a new output directory; existing artifacts are preserved');
  const infoFile = path.join(sourceApp, 'Contents/Info.plist');
  const metadata = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', infoFile]));
  if (metadata.CFBundleIdentifier !== config.bundleId || metadata.CFBundleExecutable !== 'Ecom') throw new Error('Expected a standalone Ecom release bundle, not Dev');
  if (git(sourceRoot, ['status', '--porcelain']) || git(sourceRoot, ['rev-parse', 'HEAD']) !== sourceRevision) throw new Error('Source must remain at the clean build revision');
  verifyMacArchitecture(path.join(sourceApp, 'Contents/MacOS/Ecom'));
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const stage = path.join(output, 'dmg-root'); fs.mkdirSync(stage);
  const app = path.join(stage, 'Ecom.app');
  run('/usr/bin/ditto', [sourceApp, app]);
  await shareHelperResources(app, output, metadata.CFBundleShortVersionString);
  const resources = path.join(app, 'Contents/Frameworks/Ecom Framework.framework/Versions',
                              metadata.CFBundleShortVersionString, 'Resources');
  const locales = fs.readdirSync(resources).filter(name =>
    name.endsWith('.lproj') && fs.existsSync(path.join(resources, name, 'locale.pak')));
  if (!locales.includes('zh_CN.lproj') ||
      locales.some(name => !/^zh_CN(?:_(?:FEMININE|MASCULINE|NEUTER))?\.lproj$/.test(name))) {
    throw new Error('Expected only the Simplified Chinese interface locale');
  }
  const plist = path.join(app, 'Contents/Info.plist');
  fs.copyFileSync(plist, path.join(output, 'original-Info.plist'), fs.constants.COPYFILE_EXCL);
  // This is a newly created packaging copy; the build output stays intact.
  const packagedInfo = { ...metadata, EcomReleaseVersion: config.version, EcomSourceRevision: sourceRevision, EcomUpdateProtocol: config.updateProtocol, EcomUpdatePackage: config.packageName, EcomUpdateChannel: config.channel };
  fs.writeFileSync(plist, JSON.stringify(packagedInfo));
  run('/usr/bin/plutil', ['-convert', 'xml1', plist]);
  const helpers = path.join(app, 'Contents/Helpers'); fs.mkdirSync(helpers, { recursive: true });
  const helper = path.join(helpers, 'EcomUpdater');
  if (fs.existsSync(helper)) throw new Error('Unexpected updater in build output');
  run('/usr/bin/xcrun', ['swiftc', '-swift-version', '5', '-O', '-parse-as-library', '-target', 'arm64-apple-macos13.0', path.join(sourceRoot, 'ecom/updater/EcomUpdater.swift'), '-o', helper]);
  run(helper, ['--self-test']);
  // Seal Mach-O files and nested bundles from the inside out. Chromium's
  // build output may carry linker signatures without sealed bundle resources.
  signMacBundle(app, sourceRoot);
  await auditMacBundle(app);
  const payload = path.join(output, 'npm'); fs.mkdirSync(payload);
  const archive = path.join(payload, 'Ecom.tar.xz');
  run('/usr/bin/tar', ['-cJf', archive, '-C', stage, config.appName]);
  const manifest = artifactManifest(config, sourceRevision, await sha256(archive), fs.statSync(archive).size);
  writeNew(path.join(payload, 'artifact.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeNew(path.join(payload, 'package.json'), JSON.stringify(payloadPackage(config), null, 2) + '\n');
  fs.copyFileSync(path.join(sourceRoot, 'LICENSE'), path.join(payload, 'LICENSE'), fs.constants.COPYFILE_EXCL);
  fs.symlinkSync('/Applications', path.join(stage, 'Applications'));
  const dmg = path.join(output, `Ecom-${config.version}-macos-arm64.dmg`);
  run('/usr/bin/hdiutil', ['create', '-volname', 'Ecom', '-srcfolder', stage, '-format', 'UDZO', dmg]);
  const tarball = path.join(output, `petercjl-ecom-macos-arm64-${config.version}.tgz`);
  if (fs.existsSync(tarball)) throw new Error('Native npm payload already exists');
  packNativePayload(payload, output);
  if (!fs.statSync(tarball).isFile()) throw new Error('npm pack did not produce the expected payload');
  if (fs.statSync(tarball).size > 390_000_000) throw new Error('Payload exceeds npm CLI publication size budget');
  const receipt = { ...manifest, dmg: path.basename(dmg), dmgSha256: await sha256(dmg), tarball: path.basename(tarball), tarballSha256: await sha256(tarball), buildEnvironment: { node: process.version, xcode: run('/usr/bin/xcodebuild', ['-version']).split('\n')[0], sdk: run('/usr/bin/xcrun', ['--sdk', 'macosx', '--show-sdk-version']), argsSha256: await sha256(path.resolve(sourceRoot, '../out/Release_arm64/args_generated.gni')) }, updaterSelfTest: true, localUpdateRecoveryVerified: true, codesignVerified: true, nativeSmokeTest: false, updateRoundTripVerified: false, published: false };
  writeNew(path.join(output, 'release-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  return { output, payload, dmg, tarball, receipt };
}
