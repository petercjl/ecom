# Install for the current Agent

User prompt: “帮我安装 @petercjl/ecom-cli，并安装它的配套 Skill。”

## Agent bootstrap contract

1. Resolve an available Node.js 22+ runtime from the current Agent's environment/configuration or PATH. Resolve that Agent's exact Skill directory from its advertised host configuration. Arbitrary valid Agent names use the generic adapter; do not infer another Agent's directory.
2. Acquire the requested public npm package using the supported package manager. `npm install -g @petercjl/ecom-cli` provides the bootstrap CLI. This is partial installation until the Skill is installed. With scripts disabled, follow the same explicit steps below; postinstall is only a notice.
3. Discover `ecom-cli capabilities --json` and `ecom-cli skill source --json`. Use the declared exact-target contract: `ecom-cli skill install --agent <current-agent-name> --target <absolute-skill-directory> --json`. The directory is the Skill itself, not its parent. Source code and accounts are not copied from the browser.
4. Verify `current=true`, `managed=true`, `edited=false`, SHA-256 verification, package version and returned CLI entry. Load the installed `SKILL.md` through the current Agent's own discovery mechanism; refresh discovery if the host requires it. Installation is complete only after both package integrity and host discovery succeed.
5. Use the returned isolated `.runtime/bin/ecom-cli.mjs` with Node.js for subsequent calls. The bootstrap npm package may then be removed; this Skill and runtime remain functional. A system Node.js runtime and the separately installed Ecom browser are declared external dependencies.

Existing unmanaged or edited destinations are preserved and produce a structured conflict. Choose an unused destination or reconcile user edits with a backup. Never install other Agents merely because their directories exist. Runtime support is capability-based; current real browser validation is macOS. No prior published updater exists for this first release.
