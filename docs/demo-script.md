# ContextParcel 10–20 second demo script

This script is designed for a real browser and terminal recording. Do not replace the browser or agent output with a mock while presenting it as a live capture.

## Prepare once

1. Use a small public demo repository with a clean, understandable Git history.
2. Run `contextparcel init --name DemoService` in that repository.
3. Start `contextparcel serve` in a terminal with a compact prompt.
4. Load the release extension and complete `contextparcel pair` before recording.
5. Install and authenticate Codex CLI using its normal login flow.
6. Open a short ChatGPT planning conversation that already states:
   - goal: add `GET /health`;
   - decision: return `{ "status": "ok" }`;
   - constraint: no database;
   - acceptance: endpoint returns HTTP 200 and has a test.
7. Make one harmless uncommitted change in the demo repository so the Git preview is visible.

## Recording timeline

| Time    | Action                                                                                                                                | Visible result                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 0–3 s   | Show the final ChatGPT planning messages and click **Handoff**.                                                                       | ContextParcel opens beside the active conversation.                                                                 |
| 3–6 s   | Choose **Selected messages**, select the requirement and decision messages, choose `DemoService`, and keep Codex/Git context enabled. | Only the intended messages are checked.                                                                             |
| 6–9 s   | Click **Preview**.                                                                                                                    | The panel shows message counts, project, branch, changed-file count, and Codex.                                     |
| 9–11 s  | Click **Send**.                                                                                                                       | A local handoff ID/path appears and Codex starts through its CLI.                                                   |
| 11–18 s | Let Codex read `handoff.md` and inspect the repository.                                                                               | Codex states the health-route goal, JSON decision, no-database constraint, acceptance test, branch, and dirty file. |

## Recording checks

- Keep the address bar visible when practical so viewers can see the ChatGPT page.
- Do not show pairing tokens, private paths, unrelated conversations, credentials, or proprietary code.
- Avoid cuts between clicking **Send** and the CLI starting. If startup exceeds 20 seconds, trim only idle time and disclose the cut.
- Record the actual extension build attached to the same release being demonstrated.
- Verify the handoff directory is ignored by Git before recording.

## No-agent fallback demo

For documentation or a talk without agent quota, run:

```bash
contextparcel send --target codex --message "Add GET /health" --dry-run
```

Show the generated `handoff.json`, `handoff.md`, and bootstrap prompt. Label this clearly as a dry run; do not claim that Codex was launched.
