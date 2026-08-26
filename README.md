# ContextParcel

**Stop re-explaining your project when switching AI agents.**

One-click context handoff from ChatGPT to Codex, Claude Code, and Cursor. Discuss anywhere. Build anywhere.

[简体中文](README.zh-CN.md) · [Protocol](docs/protocol.md) · [Security](SECURITY.md)

```text
ChatGPT / selected web text
             │
        click Handoff
             ▼
       ContextParcel
    conversation + Git
             │
       local handoff.md
        ┌────┼─────┐
        ▼    ▼     ▼
     Codex Claude Cursor
```

Your conversations stay on your machine. ContextParcel has no hosted backend, needs no account or API key, and never reads conversations you did not explicitly hand off.

## Install and make your first handoff

ContextParcel is currently distributed through GitHub Releases. The npm name is reserved but the package is not yet published to the npm registry.

```bash
npm install -g https://github.com/AIM135D/contextparcel/releases/download/v0.1.0/contextparcel-0.1.0.tgz

cd /path/to/your/project
contextparcel init
contextparcel serve
```

Then install the browser extension:

1. Download `contextparcel-extension-v0.1.0.zip` from the [v0.1.0 release](https://github.com/AIM135D/contextparcel/releases/tag/v0.1.0) and unzip it.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**, choose **Load unpacked**, and select the unzipped directory.
4. In another terminal, run `contextparcel pair` and enter the one-time code in the extension.
5. Open a ChatGPT conversation and click **Handoff**.

The extension previews the exact message counts, project, Git state, and target before anything is written or launched.

## Four focused capabilities

### One-click handoff

Send selected messages, the most recent N messages, or the full open ChatGPT conversation. If ChatGPT changes its DOM, select text on any page and use **Handoff selection** from the browser context menu.

### Project-aware

Each packet combines the authorized conversation with the registered repository's branch, HEAD, dirty state, changed file names, diff stat, and five recent commits. Git collection is read-only; full diffs and file contents are not collected.

### Local-first

The extension talks only to a daemon bound to `127.0.0.1`. A one-time pairing code establishes an extension-specific secret. The daemon validates both the exact extension Origin and the bearer token on every private route.

### Open Handoff Protocol

Every transfer writes a versioned `handoff.json` plus a readable `handoff.md`. Third-party source and target adapters can implement the same [Handoff Packet v1](docs/protocol.md).

## What gets created

`contextparcel init` registers the canonical project root and creates:

```text
.contextparcel/
├── config.json
└── handoffs/
    └── .gitkeep
```

It adds this privacy rule to `.gitignore`:

```gitignore
.contextparcel/handoffs/*
!.contextparcel/handoffs/.gitkeep
```

Each handoff is stored under `.contextparcel/handoffs/<id>/` as `handoff.json` and `handoff.md`. The global history index contains metadata only. Conversation artifacts remain locally until you run `contextparcel delete <id>` or `contextparcel clear`.

## Browser workflow

The panel lets you choose:

- Target: Codex, Claude Code, or Cursor.
- Conversation: selected messages, recent messages, full conversation, or a generic page selection.
- Project: any root previously registered with `contextparcel init`.
- Included data: Git context, user messages, assistant messages, and the current task.

The extension does not type into ChatGPT, send ChatGPT messages, browse other conversations, or run arbitrary shell commands.

## CLI

```text
contextparcel init [path]            initialize and register a project
contextparcel serve                 run the 127.0.0.1 daemon
contextparcel status                show daemon, pairing, and project state
contextparcel pair                  issue a one-time six-digit pairing code
contextparcel doctor                check Node, Git, daemon, extension, and agent CLIs
contextparcel history               list local metadata
contextparcel delete <id>           remove one packet and its conversation data
contextparcel clear                 remove every packet and history record
contextparcel send                  hand off text/JSON from a file, flag, or stdin
contextparcel demo                  print a sample handoff
```

Privacy-check a packet without launching an agent:

```bash
contextparcel send --target codex --message "Implement the agreed API" --dry-run
```

Send an exported array of `{ "role": "user|assistant", "text": "..." }` messages:

```bash
contextparcel send --target claude --project my-project --file conversation.json
```

## Target adapters

| Target      | Detection                                        | Launch form                     | Install documentation                                                       |
| ----------- | ------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------- |
| Codex       | `codex --version`                                | `codex --cd <project> <prompt>` | [Codex CLI](https://developers.openai.com/codex/cli/)                       |
| Claude Code | `claude --version`                               | `claude <prompt>`               | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/cli-usage) |
| Cursor      | `agent --version`, then `cursor-agent --version` | `<command> <prompt>`            | [Cursor CLI](https://cursor.com/docs/cli/overview)                          |

ContextParcel uses the agent's existing login state. It does not read or copy authentication files. Agent processes are launched with an executable and argument array, never a shell-interpolated command.

## Security model

The daemon accepts project IDs, not paths, from the extension. IDs resolve through the local project registry, and every generated artifact path is checked against the canonical registered root. Requests have strict Zod schemas and a 2 MiB body limit. CORS is granted only to the paired `chrome-extension://` Origin.

ContextParcel does not read `.env`, SSH keys, credentials, repository file contents, or the full Git diff. See [SECURITY.md](SECURITY.md) for the threat model and reporting process.

## Develop from source

Requires Node.js 20 or later.

```bash
git clone https://github.com/AIM135D/contextparcel.git
cd contextparcel
npm ci
npm run verify
node dist/contextparcel.cjs demo
```

Load `apps/extension/dist` as an unpacked extension after `npm run build`.

## Demo

Run `contextparcel demo` for an installation-free example, or inspect [`examples/sample-handoff`](examples/sample-handoff). [`docs/demo-script.md`](docs/demo-script.md) contains a 10–20 second recording plan. The repository does not include a simulated browser recording presented as a real one.

## Related projects

- [ContextRelay](https://github.com/proofofwork-agency/contextrelay) coordinates context between coding agents. ContextParcel concentrates on the preceding transition from a web planning conversation into a local coding agent, with repository state attached.
- [HandoffKit](https://github.com/dyngai/handoffkit) explores structured handoffs for AI coding work. ContextParcel adds an explicit browser-to-local flow and a paired localhost boundary.

These tools address adjacent workflows; the distinctions above describe scope, not quality.

## V0.1 limitations

- ChatGPT Web is the only structured web adapter. Other sites use text selection.
- The extension is distributed as a release ZIP, not through Chrome Web Store or Edge Add-ons.
- npm registry publication is pending; install the release tarball instead.
- Packets are local files with no cloud sync, team workspace, or automatic summarization.

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), especially the small source and target adapter interfaces.

MIT © 2026 ContextParcel contributors
