# Contributing to ContextParcel

ContextParcel stays useful by keeping a narrow boundary: explicit context moves from a web conversation into a registered local project and a known coding-agent CLI. Proposals for cloud sync, accounts, autonomous agent orchestration, or remote execution are outside the v0.x scope.

## Set up

```bash
git clone https://github.com/AIM135D/contextparcel.git
cd contextparcel
npm ci
npm run verify
```

Use Node.js 20 or later. Do not run real Codex, Claude Code, or Cursor sessions from tests; inject a `ProcessRunner` or `TargetFactory` mock.

## Add a source adapter

Source adapters live in `apps/extension/src/browser/adapters/` and implement:

```ts
interface SourceAdapter {
  readonly id: string;
  canHandle(): boolean;
  extract(): {
    title: string;
    type: "chatgpt-web" | "web-selection";
    messages: Array<{ id?: string; role: "user" | "assistant"; text: string }>;
  };
}
```

To add Claude Web, Gemini, or another site:

1. Put selectors and parsing logic in a dedicated adapter, not the panel component.
2. Read only the current page after an explicit Handoff action.
3. Prefer semantic attributes and layered fallbacks over generated CSS class names.
4. Throw `SourceAdapterError` with a user-actionable message when extraction fails.
5. Keep Generic Selection available as the final fallback.
6. Add DOM fixture tests without real account data.

If a site requires new host permissions, explain the minimum scope in the pull request.

## Add a target adapter

Target adapters live in `packages/target-adapters/src/` and implement `TargetAdapter` from `base.ts`.

To add OpenCode, Gemini CLI, Aider, or another agent:

1. Detect the documented executable with `--version` or an equivalent non-mutating flag.
2. Build a prompt that points to the absolute `handoff.md` path.
3. Launch with an executable and argv array using `shell: false`.
4. Reuse the user's existing authentication state without reading credential files.
5. Return a clear, official installation link when the CLI is absent.
6. Test detection, prompt generation, missing-command behavior, and argv boundaries with a mock runner.

Do not add auto-approval or sandbox-bypass flags.

## Protocol changes

Update all of the following together:

- `packages/protocol/src/index.ts`
- `docs/handoff-packet.schema.json`
- `docs/protocol.md`
- `examples/sample-handoff/`
- protocol and integration tests

Explain version compatibility and privacy effects. Breaking changes require a new major protocol version.

## Pull request checklist

- `npm run verify` passes.
- New behavior has unit or integration coverage.
- Security-sensitive changes include negative tests.
- Documentation makes no claim about a store, registry, or release that does not exist.
- No private conversations, tokens, absolute personal paths, or generated handoff artifacts are committed.
