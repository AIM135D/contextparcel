# Changelog

All notable changes to ContextParcel are documented here.

## 0.2.0 - 2026-08-26

- Added idempotent guided `setup` and managed `start`, `stop`, and `restart` commands.
- Made `doctor` report concrete required actions and daemon ownership details.
- Changed browser preview requests to metadata-only payloads; conversation text is sent locally only after confirmation.
- Hardened ChatGPT extraction for long conversations, duplicate DOM IDs, code blocks, and recent-message bounds.
- Limited pairing-code guesses, added safe stale-PID handling, and serialized local state/history mutations.
- Added fresh-install, lifecycle, payload-limit, invalid-project, injection, setup, and version-sync coverage.
- Made release archive names and checksums version-driven.

## 0.1.0 - 2026-08-26

- Added the Manifest V3 Chrome/Edge extension with ChatGPT and generic-selection source adapters.
- Added project registration, localhost pairing, strict Origin/token authentication, and local history deletion.
- Added Handoff Packet v1 JSON/Markdown generation with read-only Git context.
- Added Codex, Claude Code, and Cursor target adapters plus dry-run support.
- Added cross-platform CI, security/integration coverage, release ZIP packaging, and checksums.
