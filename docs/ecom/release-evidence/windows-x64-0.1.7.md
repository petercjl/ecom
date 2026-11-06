# Windows x64 0.1.7 publication evidence

Native build source 0cc91b3876f3e2e17105ed4a0a359e4b4ffd6a1d includes the accepted P2 implementation. Dev acceptance source 5e534887948e29b2d7eb409cd76e1d1aa497b8a6 is bound through dev-2026-11-06-p2.md. The user explicitly authorized both platform builds and direct latest publication.

The unified Windows formal build completed 20 steps in 1m34.60s on the physical peter-new machine on 2026-11-06. Packaging passed the updater self-test, reconstructed payload verification and corrupted-part rejection. The unsigned installer and six npm payload parts pin the same source and archive. Full hashes and sizes are recorded in the adjacent JSON. Installed-app smoke, public update and rollback round trips are not claimed for this new version and are optional under the internal direct-latest policy. The installed daily browser was preserved.

Public registry, workflow result and final channel verification will be appended after actual publication.
