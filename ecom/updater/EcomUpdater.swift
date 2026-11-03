// Copyright 2026 Ecom Authors. MPL-2.0.
// Standalone macOS helper; it uses no Node runtime or browser credentials.
import AppKit
import CryptoKit
import Darwin

enum UpdateFailure: Error { case invalid(String) }
func allowedOrigin(_ value: String?) -> String? {
    guard let value, let url = URLComponents(string: value), url.scheme == "https", url.host != nil,
          url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
          url.path.isEmpty || url.path == "/" else { return nil }
    return url.url?.absoluteString
}
func relaunchArguments(profile: String, origin: String? = nil) -> [String] {
    var arguments = ["--user-data-dir=" + profile, "--restore-last-session"]
    if let origin = allowedOrigin(origin) { arguments.append("--ecom-native-cli-origin=" + origin) }
    return arguments
}
func require(_ condition: Bool, _ reason: String) throws {
    if !condition { throw UpdateFailure.invalid(reason) }
}
func stableVersion(_ value: String) throws -> [Int] {
    let parts = value.split(separator: ".", omittingEmptySubsequences: false)
    try require(parts.count == 3 && parts.allSatisfy { !$0.isEmpty && $0.allSatisfy { $0.isASCII && $0.isNumber } }, "version")
    let numbers = parts.compactMap { Int($0) }
    try require(numbers.count == 3, "version overflow")
    return numbers
}
func newer(_ candidate: String, than current: String) throws -> Bool {
    let a = try stableVersion(candidate), b = try stableVersion(current)
    return b.lexicographicallyPrecedes(a)
}
func safeArchivePaths(_ paths: String, prefix: String) throws {
    let entries = paths.split(separator: "\n").map(String.init)
    try require(!entries.isEmpty, "empty archive")
    for entry in entries {
        try require(entry.hasPrefix(prefix) && !entry.contains("\\") && !entry.split(separator: "/").contains(".."), "archive path")
    }
}
func validateBundleLinks(_ candidate: URL) throws {
    guard let items = FileManager.default.enumerator(at: candidate, includingPropertiesForKeys: [.isSymbolicLinkKey]) else { throw UpdateFailure.invalid("bundle enumeration") }
    for case let item as URL in items {
        try require(item.resolvingSymlinksInPath().path.hasPrefix(candidate.path + "/"), "external bundle symlink")
    }
}
func activateBundle(app: URL, candidate: URL, backup: URL) throws {
    let fm = FileManager.default
    try require(fm.fileExists(atPath: app.path) && !fm.fileExists(atPath: backup.path), "replacement preflight")
    try fm.moveItem(at: app, to: backup)
    do { try fm.moveItem(at: candidate, to: app) }
    catch { try fm.moveItem(at: backup, to: app); throw error }
}
func restoreBundle(app: URL, backup: URL, failed: URL) throws {
    let fm = FileManager.default
    try require(fm.fileExists(atPath: backup.path) && !fm.fileExists(atPath: failed.path), "recovery preflight")
    if fm.fileExists(atPath: app.path) { try fm.moveItem(at: app, to: failed) }
    try fm.moveItem(at: backup, to: app)
}
func transactionSelfTest() throws {
    let fm = FileManager.default
    let dir = fm.temporaryDirectory.appendingPathComponent("ecom-transaction-test-" + UUID().uuidString)
    try fm.createDirectory(at: dir, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
    defer { try? fm.removeItem(at: dir) }
    let app = dir.appendingPathComponent("Ecom.app"), candidate = dir.appendingPathComponent("candidate.app")
    let backup = dir.appendingPathComponent("previous.app"), failed = dir.appendingPathComponent("failed.app")
    try Data("old".utf8).write(to: app, options: .withoutOverwriting)
    try Data("new".utf8).write(to: candidate, options: .withoutOverwriting)
    try activateBundle(app: app, candidate: candidate, backup: backup)
    try require(try Data(contentsOf: app) == Data("new".utf8) && Data(contentsOf: backup) == Data("old".utf8), "activation")
    try restoreBundle(app: app, backup: backup, failed: failed)
    try require(try Data(contentsOf: app) == Data("old".utf8) && Data(contentsOf: failed) == Data("new".utf8), "rollback")
    do { try activateBundle(app: app, candidate: candidate, backup: backup); throw UpdateFailure.invalid("missing candidate accepted") }
    catch { try require(try Data(contentsOf: app) == Data("old".utf8) && !fm.fileExists(atPath: backup.path), "failed replacement preserved original") }
    try require(try digest(app) == "cba06b5736faf67e54b07b561eae94395e774c517a7d910a54369e1263ccfbd4", "sha256")
}
func digest(_ url: URL, sha512: Bool = false) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var a = SHA256(), b = SHA512()
    while let data = try handle.read(upToCount: 1024 * 1024), !data.isEmpty {
        if sha512 { b.update(data: data) } else { a.update(data: data) }
    }
    if sha512 { return Data(b.finalize()).base64EncodedString() }
    return a.finalize().map { String(format: "%02x", $0) }.joined()
}
@discardableResult
func run(_ executable: String, _ arguments: [String], output: URL? = nil) throws -> String {
    let process = Process(), pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: executable); process.arguments = arguments
    var file: FileHandle?
    if let output {
        try require(!FileManager.default.fileExists(atPath: output.path), "output exists")
        try Data().write(to: output, options: .withoutOverwriting)
        file = try FileHandle(forWritingTo: output); process.standardOutput = file
    } else { process.standardOutput = pipe }
    process.standardError = FileHandle.nullDevice
    try process.run()
    let data = output == nil ? pipe.fileHandleForReading.readDataToEndOfFile() : Data()
    process.waitUntilExit(); try file?.close()
    try require(process.terminationStatus == 0, "tool failed: " + executable)
    return String(data: data, encoding: .utf8) ?? ""
}
func verifyArm64(_ executable: URL) throws {
    try run("/usr/bin/lipo", [executable.path, "-verify_arch", "arm64"])
}
struct Artifact: Decodable {
    let schemaVersion: Int, updateProtocol: Int
    let packageName: String, version: String, channel: String, platform: String, arch: String
    let bundleId: String, appName: String, signing: String, notarized: Bool
    let sourceRevision: String, archive: String, archiveSha256: String, archiveBytes: Int
    func validate(version expected: String) throws {
        try require(schemaVersion == 1 && updateProtocol == 1 && packageName == "@petercjl/ecom-macos-arm64" && version == expected && channel == "latest" && platform == "darwin" && arch == "arm64" && bundleId == "app.ecom.browser" && appName == "Ecom.app" && archive == "Ecom.tar.xz" && signing == "ad-hoc" && !notarized && sourceRevision.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil && archiveSha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil && archiveBytes > 0, "artifact contract")
    }
}
final class RegistrySession: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(Self.allowed(request.url) ? request : nil)
    }
    static func allowed(_ url: URL?) -> Bool {
        url?.scheme == "https" && url?.host == "registry.npmjs.org" && url?.user == nil && url?.password == nil && (url?.port == nil || url?.port == 443)
    }
}
@MainActor
final class Updater {
    let app: URL, owner: NSRunningApplication, current: String, currentSource: String, profile: String, channel: String, origin: String?
    let fm = FileManager.default
    let delegate = RegistrySession()
    var downloadRequested = false
    lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.urlCredentialStorage = nil
        config.timeoutIntervalForRequest = 60; config.timeoutIntervalForResource = 3600
        return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }()
    init(path: String, pid: pid_t, profilePath: String, cliOrigin: String?) throws {
        app = URL(fileURLWithPath: path).standardizedFileURL.resolvingSymlinksInPath()
        guard let bundle = Bundle(url: app), let process = NSRunningApplication(processIdentifier: pid),
              let version = bundle.object(forInfoDictionaryKey: "EcomReleaseVersion") as? String,
              let source = bundle.object(forInfoDictionaryKey: "EcomSourceRevision") as? String else { throw UpdateFailure.invalid("application") }
        try require(app.lastPathComponent == "Ecom.app" && bundle.bundleIdentifier == "app.ecom.browser" && process.bundleIdentifier == "app.ecom.browser" && process.bundleURL?.resolvingSymlinksInPath() == app && bundle.object(forInfoDictionaryKey: "EcomUpdatePackage") as? String == "@petercjl/ecom-macos-arm64", "application identity")
        let selectedChannel = bundle.object(forInfoDictionaryKey: "EcomUpdateChannel") as? String ?? "latest"
        try require(selectedChannel == "latest" || (selectedChannel == "next" && bundle.object(forInfoDictionaryKey: "EcomUpdateTestSeed") as? Bool == true), "update channel")
        try require(profilePath.hasPrefix("/") && !profilePath.contains("\0"), "profile path")
        _ = try stableVersion(version); current = version; currentSource = source; owner = process
        profile = profilePath; channel = selectedChannel; origin = allowedOrigin(cliOrigin)
    }
    func ask(_ title: String, _ message: String, _ action: String) -> Bool {
        let alert = NSAlert(); alert.messageText = title; alert.informativeText = message
        alert.addButton(withTitle: action); alert.addButton(withTitle: "稍后")
        NSApp.activate(ignoringOtherApps: true)
        return alert.runModal() == .alertFirstButtonReturn
    }
    func checkResponse(_ response: URLResponse, maxBytes: Int = 1_500_000_000) throws {
        try require((response as? HTTPURLResponse)?.statusCode == 200 && RegistrySession.allowed(response.url) && response.expectedContentLength <= maxBytes, "registry response")
    }
    func check() async throws -> Bool {
        downloadRequested = false
        let url = URL(string: "https://registry.npmjs.org/@petercjl%2fecom-macos-arm64/" + channel)!
        let (data, response) = try await session.data(from: url)
        // An unpublished first version is an ordinary no-update result.
        if (response as? HTTPURLResponse)?.statusCode == 404 { return false }
        try checkResponse(response, maxBytes: 1_000_000)
        try require(data.count <= 1_000_000, "metadata size")
        guard let metadata = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              metadata["name"] as? String == "@petercjl/ecom-macos-arm64",
              let version = metadata["version"] as? String,
              let dist = metadata["dist"] as? [String: Any],
              let tarball = dist["tarball"] as? String, let downloadURL = URL(string: tarball),
              let integrity = dist["integrity"] as? String else { throw UpdateFailure.invalid("registry metadata") }
        try require(RegistrySession.allowed(downloadURL) && integrity.hasPrefix("sha512-"), "registry integrity")
        if !(try newer(version, than: current)) || owner.isTerminated { return false }
        if !ask("Ecom 有新版本 " + version, "当前版本 " + current + "。下载完成后会再次询问是否退出并安装。", "下载更新") { return false }
        downloadRequested = true
        let work = fm.temporaryDirectory.appendingPathComponent("ecom-update-" + UUID().uuidString)
        try fm.createDirectory(at: work, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        defer { try? fm.removeItem(at: work) }
        let (download, downloadResponse) = try await session.download(from: downloadURL)
        try checkResponse(downloadResponse)
        let tgz = work.appendingPathComponent("payload.tgz"); try fm.moveItem(at: download, to: tgz)
        let size = try tgz.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        try require(size > 0 && size <= 1_500_000_000 && "sha512-" + (try digest(tgz, sha512: true)) == integrity, "tarball checksum")
        let entries = try run("/usr/bin/tar", ["-tzf", tgz.path]).split(separator: "\n").map(String.init)
        let expected = Set(["package/package.json", "package/artifact.json", "package/Ecom.tar.xz", "package/LICENSE"])
        try require(Set(entries) == expected && entries.count == expected.count, "package contents")
        for name in ["artifact.json", "Ecom.tar.xz", "package.json"] {
            try run("/usr/bin/tar", ["-xOzf", tgz.path, "package/" + name], output: work.appendingPathComponent(name))
        }
        let manifest = try JSONDecoder().decode(Artifact.self, from: Data(contentsOf: work.appendingPathComponent("artifact.json")))
        try manifest.validate(version: version)
        let packed = try JSONSerialization.jsonObject(with: Data(contentsOf: work.appendingPathComponent("package.json"))) as? [String: Any]
        try require(packed?["name"] as? String == manifest.packageName && packed?["version"] as? String == version, "packed identity")
        let archive = work.appendingPathComponent("Ecom.tar.xz")
        try require(try digest(archive) == manifest.archiveSha256 && archive.resourceValues(forKeys: [.fileSizeKey]).fileSize == manifest.archiveBytes, "archive checksum")
        try safeArchivePaths(run("/usr/bin/tar", ["-tf", archive.path]), prefix: "Ecom.app/")
        let parent = app.deletingLastPathComponent()
        try require(fm.isWritableFile(atPath: parent.path) && !app.path.hasPrefix("/Volumes/"), "install Ecom into a writable Applications directory")
        let staging = parent.appendingPathComponent(".ecom-stage-" + UUID().uuidString)
        try fm.createDirectory(at: staging, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        defer { try? fm.removeItem(at: staging) }
        try run("/usr/bin/tar", ["-xf", archive.path, "-C", staging.path])
        let candidate = staging.appendingPathComponent("Ecom.app")
        try validateBundleLinks(candidate)
        guard let bundle = Bundle(url: candidate) else { throw UpdateFailure.invalid("candidate bundle") }
        try require(bundle.bundleIdentifier == manifest.bundleId && bundle.object(forInfoDictionaryKey: "EcomReleaseVersion") as? String == version && bundle.object(forInfoDictionaryKey: "EcomSourceRevision") as? String == manifest.sourceRevision && bundle.object(forInfoDictionaryKey: "EcomUpdateProtocol") as? Int == 1 && bundle.object(forInfoDictionaryKey: "EcomUpdatePackage") as? String == manifest.packageName, "candidate identity")
        try require(bundle.object(forInfoDictionaryKey: "EcomUpdateChannel") as? String == "latest" && bundle.object(forInfoDictionaryKey: "EcomUpdateTestSeed") as? Bool != true, "production candidate channel")
        try run("/usr/bin/codesign", ["--verify", "--deep", "--strict", candidate.path])
        try verifyArm64(candidate.appendingPathComponent("Contents/MacOS/Ecom"))
        if owner.isTerminated || !ask("更新已准备完成", "退出 Ecom 并安装 " + version + "？账号和容器数据保留，旧应用将保留在安装目录供恢复。", "退出并安装") { return false }
        try require(owner.bundleURL?.resolvingSymlinksInPath() == app && owner.bundleIdentifier == "app.ecom.browser", "owner changed")
        try require(owner.terminate(), "normal quit refused")
        for _ in 0..<120 {
            if owner.isTerminated { break }
            try await Task.sleep(nanoseconds: 500_000_000)
        }
        try require(owner.isTerminated, "quit timed out; application preserved")
        // Re-read the on-disk plist: Bundle can cache values across replacements.
        let installed = try PropertyListSerialization.propertyList(from: Data(contentsOf: app.appendingPathComponent("Contents/Info.plist")), format: nil) as? [String: Any]
        try require(installed?["EcomReleaseVersion"] as? String == current && installed?["EcomSourceRevision"] as? String == currentSource, "installed application changed")
        try require(!NSRunningApplication.runningApplications(withBundleIdentifier: "app.ecom.browser").contains { $0.bundleURL?.resolvingSymlinksInPath() == app && !$0.isTerminated }, "application reopened")
        let backup = parent.appendingPathComponent("Ecom.previous-" + current + "-" + UUID().uuidString + ".app")
        try activateBundle(app: app, candidate: candidate, backup: backup)
        do {
            try run("/usr/bin/open", ["-n", app.path, "--args"] + relaunchArguments(profile: profile, origin: origin))
            try await Task.sleep(nanoseconds: 8_000_000_000)
            try require(NSRunningApplication.runningApplications(withBundleIdentifier: "app.ecom.browser").contains { $0.bundleURL?.resolvingSymlinksInPath() == app && !$0.isTerminated }, "updated application failed to start")
        } catch {
            // Keep both artifacts. Recovery never writes website profile data.
            let started = NSRunningApplication.runningApplications(withBundleIdentifier: "app.ecom.browser").filter { $0.bundleURL?.resolvingSymlinksInPath() == app && !$0.isTerminated }
            for process in started { _ = process.terminate() }
            for _ in 0..<120 {
                if started.allSatisfy({ $0.isTerminated }) { break }
                try await Task.sleep(nanoseconds: 500_000_000)
            }
            try require(started.allSatisfy { $0.isTerminated }, "recovery awaits normal quit; previous application retained")
            try restoreBundle(app: app, backup: backup, failed: parent.appendingPathComponent("Ecom.failed-" + UUID().uuidString + ".app"))
            _ = try? run("/usr/bin/open", ["-n", app.path, "--args"] + relaunchArguments(profile: profile, origin: origin))
            throw error
        }
        return true
    }
}

@main
struct Main {
    @MainActor static func main() {
        if CommandLine.arguments == [CommandLine.arguments[0], "--self-test"] {
            do {
                try require(try newer("0.2.0", than: "0.1.99"), "comparison")
                try require(try !newer("0.1.0", than: "0.1.0"), "equal")
                for invalid in ["1.0", "1.0.0-next.1", "-1.0.0", "1.0.0/../../"] {
                    do { _ = try stableVersion(invalid); fatalError("accepted invalid version") } catch {}
                }
                try safeArchivePaths("Ecom.app/Contents/MacOS/Ecom\n", prefix: "Ecom.app/")
                for invalid in ["/tmp/Ecom.app/x", "Ecom.app/../outside", "Other.app/x"] {
                    do { try safeArchivePaths(invalid, prefix: "Ecom.app/"); fatalError("accepted unsafe archive") } catch {}
                }
                try require(!RegistrySession.allowed(URL(string: "https://registry.npmjs.org.evil.test/x")), "host check")
                try require(relaunchArguments(profile: "/tmp/Ecom 账号") == ["--user-data-dir=/tmp/Ecom 账号", "--restore-last-session"], "profile restoration")
                try require(relaunchArguments(profile: "/tmp/profile", origin: "https://sycm.taobao.com/").last == "--ecom-native-cli-origin=https://sycm.taobao.com/", "CLI origin restoration")
                try require(allowedOrigin("https://user:password@example.com/") == nil && allowedOrigin("http://example.com/") == nil && allowedOrigin("https://example.com/path") == nil, "CLI origin restriction")
                try transactionSelfTest()
                try verifyArm64(URL(fileURLWithPath: CommandLine.arguments[0]))
                print("Ecom updater contract self-test passed")
            } catch { fputs("Updater self-test failed\n", stderr); exit(1) }
            return
        }
        guard (4...5).contains(CommandLine.arguments.count), let pid = Int32(CommandLine.arguments[2]) else { exit(2) }
        _ = NSApplication.shared; NSApp.setActivationPolicy(.accessory)
        do {
            let updater = try Updater(path: CommandLine.arguments[1], pid: pid, profilePath: CommandLine.arguments[3], cliOrigin: CommandLine.arguments.count == 5 ? CommandLine.arguments[4] : nil)
            NSApp.applicationIconImage = NSWorkspace.shared.icon(forFile: updater.app.path)
            // Process-scoped lock avoids duplicate helpers without persisting a stale PID.
            let lockPath = updater.app.path + ".update-lock"
            let fd = open(lockPath, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
            guard fd >= 0 else { exit(0) }
            var acquired = false
            // The prior helper can still be checking startup after an update.
            for _ in 0..<100 {
                if flock(fd, LOCK_EX | LOCK_NB) == 0 { acquired = true; break }
                usleep(200_000)
            }
            guard acquired else { close(fd); exit(0) }
            Task { @MainActor in
                while !updater.owner.isTerminated {
                    do { if try await updater.check() { break } }
                    catch {
                        NSLog("Ecom update check failed: %@", String(describing: error))
                        if updater.downloadRequested {
                            let alert = NSAlert(); alert.messageText = "Ecom 更新未完成"
                            alert.informativeText = "当前应用与账号数据已保留。请确认 Ecom 位于可写的应用目录，然后重试。"
                            alert.addButton(withTitle: "知道了"); NSApp.activate(ignoringOtherApps: true); alert.runModal()
                        }
                    }
                    // Wake periodically to stop alongside the owning browser.
                    for _ in 0..<2160 {
                        if updater.owner.isTerminated { break }
                        try? await Task.sleep(nanoseconds: 10_000_000_000)
                    }
                }
                close(fd); NSApp.terminate(nil)
            }
            NSApp.run()
        } catch { exit(2) }
    }
}
