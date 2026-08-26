# Mission

Add a health endpoint.

# Conversation Context

Source: Health endpoint planning (sample)  
Selection: selected  
Messages: 2

## 1. User

Add GET /health. Return a small JSON response and keep it unauthenticated.

## 2. Assistant

Agreed: return `{ "status": "ok" }`, add an integration test, and do not introduce a database.

# Decisions / Constraints

- Keep the existing server binding.
- Do not add a database.

Acceptance: `GET /health` returns HTTP 200 and `{ "status": "ok" }`.

# Repository State

Project: sample-service  
Branch: feature/health  
HEAD: `197cc21c074417812474d36d5f982e050ec64737`  
Dirty: yes

# Changed Files

- `M` `src/server.ts`

# Recent Commits

- `197cc21c0744` feat: add HTTP server

# Pickup Instructions

Inspect the repository, preserve existing changes, implement the endpoint, and run the tests.
