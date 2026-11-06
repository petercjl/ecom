# Windows x64 0.1.7 publication evidence

Native build source 0cc91b3876f3e2e17105ed4a0a359e4b4ffd6a1d includes the accepted P2 implementation. Dev acceptance source 5e534887948e29b2d7eb409cd76e1d1aa497b8a6 is bound through dev-2026-11-06-p2.md. The user explicitly authorized both platform builds and direct latest publication.

The unified Windows formal build completed 20 steps in 1m34.60s on the physical peter-new machine on 2026-11-06. Packaging passed the updater self-test, reconstructed payload verification and corrupted-part rejection. The unsigned installer and six npm payload parts pin the same source and archive. Full hashes and sizes are recorded in the adjacent JSON. Installed-app smoke, public update and rollback round trips are not claimed for this new version and are optional under the internal direct-latest policy. The installed daily browser was preserved.


Published through GitHub Actions OIDC: https://github.com/petercjl/ecom/actions/runs/42224078628 (success). At 2026-11-06T15:32:51.622Z, latest resolved to 0.1.7. The primary package and all six payload parts were fully downloaded from public npm on the Mac build host. Every size, SHA-256 and SHA-512 SRI matched the build record; the real release validator reconstructed and verified the original installer archive. The peter-new download probe was interrupted by host connectivity loss, so it is not claimed as a completed host test.

Actions reported zero remaining temporary transfer artifacts after automatic cleanup. The temporary local relay and tunnel were stopped, and the 250740736-byte relay mirror removed. First-install files remain in the original platform build directories. The installed browsers and user data were preserved.
