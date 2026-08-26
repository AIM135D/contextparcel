# ContextParcel Handoff Protocol

Handoff Packet v1 is a local, file-based interchange format for moving explicitly authorized conversation context and read-only repository state into a coding agent.

The normative schema is [`handoff-packet.schema.json`](handoff-packet.schema.json). Runtime producers and consumers should validate packets before use. ContextParcel's TypeScript implementation uses Zod and rejects unknown fields.

## Envelope

Every packet contains:

| Field            | Required | Meaning                                                            |
| ---------------- | -------- | ------------------------------------------------------------------ |
| `schema_version` | yes      | Protocol compatibility version. V1 is `1.0`.                       |
| `id`             | yes      | UUID for this handoff.                                             |
| `created_at`     | yes      | ISO 8601 timestamp.                                                |
| `source`         | yes      | Source adapter type and human-readable title.                      |
| `target`         | yes      | Intended agent and detected adapter version.                       |
| `project`        | yes      | Registered local project identity.                                 |
| `conversation`   | yes      | Authorized message subset and selection mode.                      |
| `task`           | yes      | Optional goal plus explicit constraints and acceptance criteria.   |
| `git`            | yes      | Read-only repository snapshot, or `null` when omitted/unavailable. |

See [`examples/sample-handoff/handoff.json`](../examples/sample-handoff/handoff.json) for a complete packet.

## Conversation semantics

Messages preserve source order and have only `user` or `assistant` roles in v1. A producer must include only content the user explicitly asked to transfer. `selection_mode` records whether the user chose individual messages, recent messages, the full open conversation, a generic page selection, or CLI input.

Producers must not silently fetch other threads, hidden history, or unrelated page content. Consumers must treat message text as untrusted data, never as a command-line fragment.

## Repository semantics

The v1 Git object is a snapshot, not a synchronization instruction:

- `branch` and `commit` identify the checked-out state.
- `dirty` and `changed_files` describe the working tree.
- `diff_stat` gives bounded scale without disclosing the full patch.
- `recent_commits` provides up to five nearby commit subjects in ContextParcel's reference implementation.

Consumers must not interpret this object as permission to commit, reset, checkout, clean, or otherwise change the repository.

## Privacy semantics

Packets can contain private conversation text and absolute local paths. They are local artifacts and should be excluded from version control by default. Metadata indexes should not duplicate conversation bodies.

The protocol does not require cloud transport, telemetry, a user account, or an LLM API. A transport that uploads packets must obtain separate, informed user authorization and clearly document retention.

Sensitive repository files are outside the protocol. A source must not read `.env`, private keys, credentials, or arbitrary project files to populate a packet.

## Adapter semantics

A source adapter:

1. runs only after an explicit user action;
2. returns ordered role/text messages and a source title;
3. fails closed with a useful fallback when the source DOM cannot be parsed.

A target adapter exposes:

```ts
interface TargetAdapter {
  detect(): Promise<boolean>;
  version(): Promise<string | null>;
  buildBootstrapPrompt(handoffPath: string): string;
  launch(handoffPath: string, projectRoot: string): Promise<TargetLaunchResult>;
}
```

The adapter passes the absolute `handoff.md` path in a single initial prompt argument. It must use an executable plus argv array and must not invoke a shell with conversation text.

## Human-readable companion

`handoff.md` is a non-normative view of the JSON packet. It contains Mission, Conversation Context, Decisions / Constraints, Repository State, Changed Files, Recent Commits, and Pickup Instructions. Consumers should prefer the JSON packet for machine validation and the Markdown file for direct agent pickup.

## Compatibility

`schema_version` uses `major.minor`:

- A minor revision may add optional fields without changing existing meaning.
- A major revision may change required fields or semantics.
- Consumers must reject unsupported major versions.
- Consumers may accept newer minor versions only when they ignore unknown optional fields safely. ContextParcel v0.1 intentionally uses strict validation and accepts exactly `1.0`.

Protocol proposals should include schema changes, examples, compatibility notes, privacy analysis, and tests.
