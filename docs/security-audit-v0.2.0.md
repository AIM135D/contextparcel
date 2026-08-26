# ContextParcel v0.2.0 Security Audit

Date: 2026-08-26  
Scope: CLI, localhost daemon, browser extension, protocol validation, project paths, target launchers, packaging, and release workflow.

## Executive summary

No critical or high-severity vulnerability was found. Two medium-severity hardening items and three reliability/privacy weaknesses were resolved before release. Remaining risks are documented below.

## Resolved findings

### CP-01 — Pairing-code guessing was not bounded (Medium)

The six-digit code expired after five minutes but previously allowed unlimited attempts during that window. v0.2.0 invalidates the code after ten failed guesses and includes an API regression test.

### CP-02 — PID reuse could stop an unrelated process (Medium)

A PID file alone cannot prove process ownership. Managed daemons now publish a random instance ID through `/v1/health`; `stop` signals a PID only when the stored port and instance ID match the live daemon. Stale records are removed without signalling a process.

### CP-03 — Preview received conversation text before confirmation (Privacy)

The preview route previously parsed the complete handoff request. It now accepts a strict metadata-only schema containing project ID, target, message counts, and include flags. Message bodies stay in extension memory until **Send**.

### CP-04 — Concurrent mutations could overwrite local state (Reliability)

State and history read-modify-write operations are serialized within the daemon process and use atomic temporary-file replacement. Concurrent registration and request tests cover the primary path.

### CP-05 — ChatGPT DOM edge cases could create ambiguous selections (Reliability)

Duplicate message identifiers are made unique, code blocks are fenced, recent-message input is clamped, and unrecognized DOM fails closed with a text-selection fallback.

## Controls verified

- Daemon binding is restricted to `127.0.0.1`.
- Private routes require an exact paired extension Origin and bearer token.
- Browser payloads cannot supply filesystem roots; project UUIDs resolve through the local registry.
- Generated and deleted paths are checked against canonical project roots.
- Target adapters use executable/argv spawning with `shell: false`; conversation text remains packet data.
- Strict schemas reject unknown fields, malformed JSON, invalid roles, unknown projects, and traversal fields.
- Request bodies larger than 2 MiB are rejected.
- Git inspection is read-only and excludes repository file bodies and full diffs.

## Residual risks

- Handoff files are not encrypted at rest; other processes with local filesystem access may read them.
- The unpacked extension requires Developer mode until store distribution is available.
- ChatGPT DOM changes may break structured extraction; the adapter fails closed and text selection remains available.
- Coding agents retain their normal local privileges and approval model. A handoff does not change those privileges.
