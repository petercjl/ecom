# Ecom CLI

Agent CLI and portable Skill for the Ecom desktop browser. The first release lists the names and stable IDs of existing containers without opening websites or switching tabs. Ecom must already be running in normal desktop mode. The browser transport currently supports macOS; Windows browser integration is not implemented.

## Install

Send to your current Agent:

> 帮我安装 @petercjl/ecom-cli，并安装它的配套 Skill。

The Agent needs local Node.js 22+ and terminal/file access. Installation includes the CLI and an isolated copy of the Skill in that Agent's own resolved Skill directory. See [INSTALL.md](INSTALL.md) for the bootstrap contract, including installation with npm scripts disabled.

## Use

> 用 Ecom CLI 列出我当前的浏览器容器。

Container names may identify accounts. Use a trusted Agent and share results intentionally. Installing the plugin does not authorize website operations, cookie export or account modification.

## Update

> 帮我更新 @petercjl/ecom-cli 和它的配套 Skill。

Task entry checks stable `latest` at most daily, with a 1.5 second bound. Detection only notifies; updating requires authorization. An offline check retains the installed runtime. Each selected Skill contains its own complete CLI runtime; activate the entry returned by the installer. Other Agents remain independent. See [UPDATE.md](UPDATE.md).

## Developer contract

`ecom-cli help --json`, `version --json`, `capabilities --json`, `schema --json`, and `doctor --json` expose supported commands and versioned results. Errors use JSON with stable codes; exit code 2 means invalid arguments, 1 means operational failure. stdout contains results; stderr contains diagnostics. Multiple Ecom instances require explicit `--profile` or `--instance` selection. Connection authenticates through owner-only local mailbox files, verifies the live Ecom executable, and uses no remote debugging port.

The browser owns sessions, containers and authorization. This package owns discovery, read-only transport and managed installation. The Skill documents invocation, diagnosis and recovery. Additional browser capabilities will extend this same command/Skill contract.
