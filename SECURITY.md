# Security Policy

## Supported versions

Security fixes are provided for the latest tagged release. V0.1 is early software; update promptly when a patch release is published.

## Report a vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not include real conversations, pairing tokens, credentials, private repository paths, or proprietary source code in a public issue. If private reporting is unavailable, open a public issue containing only a request for a private contact channel.

## Trust boundaries

ContextParcel has three boundaries:

1. An untrusted webpage and the Manifest V3 extension content script.
2. The extension service worker and the localhost daemon.
3. The daemon and a user-registered project/installed coding-agent CLI.

Conversation content is always treated as untrusted text.

## Threat model and controls

### Malicious website calling localhost

Risk: a website attempts to discover projects, submit content, or launch an installed agent through `127.0.0.1`.

Controls:

- The daemon binds only to `127.0.0.1`; a caller cannot select `0.0.0.0`.
- Pairing requires a six-digit one-time code that expires after five minutes.
- Pairing is accepted only from a syntactically valid `chrome-extension://<id>` Origin whose ID matches the request body.
- Private routes require both the exact stored Origin and a 256-bit bearer token.
- CORS never uses a wildcard and preflight is denied for unpaired website origins.
- Tokens are hashed in daemon state and the plaintext token is stored only in extension-local storage.
- Request bodies are capped at 2 MiB and validated with strict schemas.

### Path traversal or arbitrary file access

Risk: webpage content supplies `../../../`, an absolute path, or a symlinked path to make the daemon write outside a project.

Controls:

- The browser API accepts a project UUID, not a path.
- `contextparcel init` records a canonical path from `realpath`.
- The daemon revalidates the registered root before each handoff.
- Handoff directories are derived from a server-generated UUID.
- The final path is checked with path-relative containment, including prefix-confusion cases.
- History deletion recomputes the expected path from the registered root before removal.

### Command injection

Risk: a conversation contains shell syntax such as `"; rm -rf ~`.

Controls:

- Conversation text is written to packet files; it is not placed in a shell command.
- Target adapters use `spawn(executable, args, { shell: false })`.
- The bootstrap argument contains a generated handoff path, not the conversation body.
- Only the built-in Codex, Claude Code, and Cursor adapters can be selected.
- The daemon exposes no generic command-execution endpoint.

The launched coding agent remains powerful and follows its own approval and sandbox settings. A handoff is not authorization to bypass those controls.

### Secret leakage

Risk: repository inspection accidentally copies secrets into a packet.

Controls:

- Git collection runs only `branch --show-current`, `rev-parse HEAD`, `status --short`, `diff --stat`, and a bounded `log` command.
- ContextParcel does not read repository files, `.env`, SSH keys, credential stores, or a full diff.
- Full conversation content is included only for the range chosen in the preview.
- Runtime handoff directories are added to `.gitignore` by default.

### Retention and local users

The global history file stores metadata. Each project's handoff directory stores the actual JSON and Markdown content until the user runs `contextparcel delete <id>` or `contextparcel clear`.

ContextParcel does not encrypt files at rest. Local users or processes with permission to read the project directory can read handoff artifacts. Use operating-system disk encryption and account isolation where this matters.

## Security invariants for contributors

- Never add a cloud upload path as an implicit default.
- Never accept a browser-supplied filesystem root.
- Never pass user-controlled text through a shell.
- Never weaken Origin and token checks to make pairing easier.
- Add a regression test for every security fix.
