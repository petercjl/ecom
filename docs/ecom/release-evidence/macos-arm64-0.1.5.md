# Mac arm64 0.1.5 release evidence

Native build source 99370033cf0bcf5ccd24e06956813ecbb83b62d3, accepted Dev source df2997318cd4661dc189666b1c19732f5145e579. The user authorized direct latest publication and replacement of the existing local formal application.

The Mac native build completed eleven steps in 2m06.56s. Packaging passed architecture, ad-hoc codesign, updater self-test and isolated update/recovery checks; the framework UUID matched its separate dSYM. This release adds the persistent Mac help-menu update entry and manual-check result/error feedback. Complete native identities, DMG and npm checksums are recorded in the adjacent JSON. Publication and installed-app GUI results follow.

Published through GitHub Actions OIDC: https://github.com/petercjl/ecom/actions/runs/42339492388 (success). At 2026-11-07T04:53:40.656Z, public latest resolved to 0.1.5. The complete 157812851-byte public tarball matched the recorded SHA-256, SHA-512 SRI and embedded archive identity through the real release validator. npm metadata became visible before the blob; publication was not marked complete until the blob passed a full download.

The user authorized replacement of the local formal app. The 0.1.3 browser exited normally; its application bundle and private configuration checkpoint were retained. The identical signed 0.1.5 application was installed at /Applications/Ecom.app and launched with session restoration, without debugging. GUI inspection confirmed seven restored tabs and the enabled Help → Ecom Update entry. The command was invoked; the standalone helper result dialog was not independently visually verified because this UI tool cannot bind the unbundled helper executable. No claim of a public updater round trip is made for this manual replacement.

Post-start checks retained four container IDs, fifteen extension records and their enabled states, and the exact bookmark file hash. The prior application and protected checkpoint remain available for recovery. The temporary verification download was removed; original DMG, npm release artifacts and crash symbols remain in the native build output.
