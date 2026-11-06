# macOS arm64 0.1.3 build evidence

Built on 2026-11-06 from committed source d5cc360664ca102e153d8969bab6f68f97c38bc5 using the unified release build entry. Native compilation took 10m12.83s. The candidate includes Ecom offline help/feedback destinations and native update-menu presentation. The later 78925bb3a correction changes Windows-only event arrays; it does not change macOS runtime inputs. Later memory comparison documentation is separate evidence.

The Dev build passed and restarted normally. Actual macOS Help > Ecom Help navigation opened chrome://ecom-help/ (displayed as ecom://ecom-help); AX inspection and a screenshot confirmed the localized offline guide rendered. The page has no WebUI message handler or new management permissions. Both release-contract suites passed (12 tests); all introduced help anchors resolve.

DMG: 248839414 bytes. npm transport tarball: 157815306 bytes; contained application archive: 157782660 bytes. The packaging receipt reports ad-hoc signature verification, updater self-test and isolated update/recovery contract verification passed. These are packaging checks, not an actual installed application update round trip.

Framework/dSYM arm64 UUID both equal 4C4C4400-5555-3144-A1A1-0097DD32534A. Crash symbols are stored separately; zero dSYM bundles exist inside the packaged application. Root UI localization is zh_CN.lproj. Bundle identity is app.ecom.browser, EcomReleaseVersion=0.1.3, with the pinned build source.

No formal application was installed or published. Native formal-app smoke/update and public next round-trip gates remain false. The Mac tarball is within the existing 390000000-byte packaging budget. Public registry delivery and native formal-app activation are separate pending acceptance gates. Windows distribution uses its existing split-payload contract.

## Direct-latest policy adoption

The user changed the internal release policy on 2026-11-06: verified Dev behavior and automatic platform packaging checks permit direct latest publication; next and full installation/update/rollback exercises are optional directed checks. The candidate now binds the actual Dev validation record in dev-2026-11-06-help.md. Historical test flags above remain unchanged and are not represented as completed. Payload bytes, native source identity and checksum pins are unchanged. No npm publication was performed by this policy change.

## Authorized formal installation and migration

On 2026-11-06 the user explicitly authorized a permanent Mac formal installation and migration of the existing Brave containers, bookmarks and extensions. The exact signed 0.1.3 application was installed at /Applications/Ecom.app and passed post-install codesign verification. The former small formal test profile was preserved as a private local backup. Brave source data and the Dev data directory were retained. No account contents, credentials or migration data were added to the repository.

The offline copy preserved three container IDs/names, 27 bookmark entries and nine user extension registrations, including one previously disabled extension. Four Cookie databases passed byte-identity and SQLite checks before startup; subsequent live databases remained populated. Original local developer-extension paths remain available to preserve path-derived IDs and settings. macOS Downloads-folder authorization was completed by the user. Website authentication and per-extension business behavior are not claimed by structural migration checks.

Actual Ecom GUI inspection confirmed the nine extension cards, expected enabled/disabled states, three legacy containers and the bookmark manager. Legacy platform categories remain unset, as they were not part of the source container schema. Both formal Ecom and Ecom Dev were simultaneously running with distinct bundle identities and profiles and without debugging/headless switches. This completes formal native smoke and migration acceptance; it is not a public npm update/rollback round trip. Published status remains false.
