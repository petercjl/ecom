# macOS arm64 0.1.4 publication evidence

Native build source 0cc91b3876f3e2e17105ed4a0a359e4b4ffd6a1d includes the accepted P2 implementation. Dev acceptance source 5e534887948e29b2d7eb409cd76e1d1aa497b8a6 is bound through dev-2026-11-06-p2.md. The user explicitly authorized both platform builds and direct latest publication.

The unified Mac formal build completed 19 steps in 1m43.62s on 2026-11-06. Packaging passed arm64 validation, ad-hoc codesign checks, compiled updater self-test and isolated update/recovery contract tests. The DMG and npm transport pin the same source and application archive; the committed JSON records hashes and sizes. Formal installed-app smoke and a public update round trip are not claimed for this new version and are optional under the internal direct-latest policy. Existing formal/Dev installations were not replaced by the build.

Public registry, workflow result and final channel verification will be appended after actual publication. No success is inferred from a workflow dispatch alone.
