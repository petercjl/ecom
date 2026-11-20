# Lumyne migration bridge Dev validation

Validated source: `1daae1e64ac37287dad0720f3298d5b0b99f2895`.

On 2026-11-21, the canonical macOS arm64 Dev entry completed an incremental build (no native engine rebuild required), normally restarted Dev with its existing profile, and reported interactive mode with debugging disabled. The native CLI confirmed the retained buyer container is authenticated through the Taobao adapter and a retained merchant container remains authenticated with its bound shop identity confirmed. No credentials or session data were exported.

The updated Swift updater compiled for macOS arm64 and passed its contract/transaction self-test, including the accepted legacy and Lumyne installation identities. Sixteen release contract tests passed, covering both scopes, platform separation, immutable payloads, archive contents and publication evidence requirements.

This is macOS Dev and updater acceptance. Windows compilation, packaged application checks, two-hop migration and registry publication are separate release evidence and are not implied by these results.
