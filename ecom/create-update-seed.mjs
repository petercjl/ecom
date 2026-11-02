import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { signMacBundle, auditMacBundle } from './package-macos.mjs';

// An isolated, explicitly marked predecessor tests next -> production updates.
// It never copies a user Profile or changes the verified release payload.
async function main() {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination || process.platform !== 'darwin') throw new Error('Usage: node ecom/create-update-seed.mjs <verified Ecom.app> <new isolated output directory>');
  if (fs.existsSync(destination)) throw new Error('Seed output already exists; choose a new directory');
  const run = (file, args) => { const r = spawnSync(file, args, { encoding: 'utf8' }); if (r.error || r.status !== 0) throw new Error(r.stderr || 'Seed tool failed'); return r.stdout; };
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', source]);
  const info = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(source, 'Contents/Info.plist')]));
  if (info.CFBundleIdentifier !== 'app.ecom.browser' || info.EcomUpdateChannel !== 'latest' || info.EcomUpdateProtocol !== 1 || !info.EcomReleaseVersion || info.EcomUpdateTestSeed) throw new Error('Expected a packaged production release');
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const app = path.join(path.resolve(destination), 'Ecom.app'); run('/usr/bin/ditto', [source, app]);
  const plist = path.join(app, 'Contents/Info.plist');
  fs.copyFileSync(plist, path.join(destination, 'original-Info.plist'), fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(plist, JSON.stringify({ ...info, EcomReleaseVersion: '0.0.0', EcomUpdateChannel: 'next', EcomUpdateTestSeed: true }));
  run('/usr/bin/plutil', ['-convert', 'xml1', plist]); signMacBundle(app); await auditMacBundle(app);
  const profile = path.join(path.resolve(destination), 'isolated-profile');
  console.log(JSON.stringify({ app, profile, channel: 'next', launch: { executable: '/usr/bin/open', args: ['-n', app, '--args', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check'] }, launched: false, releasePayloadModified: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
