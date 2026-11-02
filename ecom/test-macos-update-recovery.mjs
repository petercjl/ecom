import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Development-only integration test. Production updater definitions are read
// from their canonical source; the test entry never enters the application.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [source, requestedOutput] = process.argv.slice(2);
function run(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Recovery test failed');
  return result.stdout;
}
try {
  if (process.platform !== 'darwin' || process.arch !== 'arm64' || !source || !requestedOutput) throw new Error('Usage: node ecom/test-macos-update-recovery.mjs <verified Ecom.app> <new output directory>');
  const app = fs.realpathSync(source), output = path.resolve(requestedOutput);
  if (fs.existsSync(output)) throw new Error('Existing output preserved; choose a new directory');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const info = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Contents/Info.plist')]));
  if (info.CFBundleIdentifier !== 'app.ecom.browser' || info.EcomUpdateChannel !== 'latest' || info.EcomUpdateTestSeed) throw new Error('Expected the verified production bundle');
  fs.mkdirSync(output, { mode: 0o700 });
  const seed = path.join(output, 'predecessor');
  run(process.execPath, [path.join(root, 'ecom/create-update-seed.mjs'), app, seed]);
  const canonical = fs.readFileSync(path.join(root, 'ecom/updater/EcomUpdater.swift'), 'utf8');
  const entry = '\n@main\nstruct Main {';
  if (canonical.split(entry).length !== 2) throw new Error('Updater test entry boundary changed');
  const testSource = canonical.slice(0, canonical.indexOf(entry)) + `
@main struct RecoveryTest {
    static func main() throws {
        let fm = FileManager.default
        let source = URL(fileURLWithPath: CommandLine.arguments[1])
        let old = URL(fileURLWithPath: CommandLine.arguments[2])
        let work = URL(fileURLWithPath: CommandLine.arguments[3])
        let app = work.appendingPathComponent("Ecom.app")
        let candidate = work.appendingPathComponent("candidate.app")
        let backup = work.appendingPathComponent("previous.app")
        let failed = work.appendingPathComponent("failed.app")
        try fm.copyItem(at: old, to: app)
        try fm.copyItem(at: source, to: candidate)
        let profile = work.appendingPathComponent("isolated-profile")
        try fm.createDirectory(at: profile, withIntermediateDirectories: false)
        let sentinel = profile.appendingPathComponent("retained-data")
        try Data("isolated-profile-preserved".utf8).write(to: sentinel, options: .withoutOverwriting)
        let expected = try digest(sentinel)
        func version(_ bundle: URL) throws -> String? {
            let data = try Data(contentsOf: bundle.appendingPathComponent("Contents/Info.plist"))
            let info = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
            return info?["EcomReleaseVersion"] as? String
        }
        let targetVersion = try version(source)
        try require(try version(app) == "0.0.0", "predecessor version")
        try activateBundle(app: app, candidate: candidate, backup: backup)
        try require(try version(app) == targetVersion && version(backup) == "0.0.0", "real bundle activation")
        try run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path])
        try restoreBundle(app: app, backup: backup, failed: failed)
        try require(try version(app) == "0.0.0" && version(failed) == targetVersion, "real bundle rollback")
        try run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path])
        do {
            try activateBundle(app: app, candidate: candidate, backup: backup)
            throw UpdateFailure.invalid("missing candidate accepted")
        } catch {
            try require(try version(app) == "0.0.0" && !fm.fileExists(atPath: backup.path), "failed activation preserved original")
        }
        try require(try digest(sentinel) == expected, "profile preservation")
        print("Actual signed Ecom bundle activation, rollback and failed activation passed")
    }
}
`;
  const swift = path.join(output, 'RecoveryTest.swift');
  fs.writeFileSync(swift, testSource, { flag: 'wx', mode: 0o600 });
  const executable = path.join(output, 'RecoveryTest');
  if (fs.existsSync(executable)) throw new Error('Existing test executable preserved');
  run('/usr/bin/xcrun', ['swiftc', '-swift-version', '5', '-O', '-warnings-as-errors', '-parse-as-library', '-target', 'arm64-apple-macos13.0', swift, '-o', executable]);
  run(executable, [app, path.join(seed, 'Ecom.app'), output]);
  const evidence = { ok: true, sourceRevision: info.EcomSourceRevision, version: info.EcomReleaseVersion, actualSignedBundle: true, productionTransactionFunctions: true, activation: true, rollback: true, failedActivationPreservesOriginal: true, isolatedProfilePreserved: true, browserLaunched: false, networkUpdateTest: false };
  fs.writeFileSync(path.join(output, 'recovery-evidence.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ...evidence, output }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
