import { randomUUID } from "node:crypto";
import type { CreateHandoffRequest, HandoffPacket } from "@contextparcel/protocol";

export function packetFixture(overrides: Partial<HandoffPacket> = {}): HandoffPacket {
  return {
    schema_version: "1.0",
    id: randomUUID(),
    created_at: "2026-08-26T00:00:00.000Z",
    source: { type: "chatgpt-web", title: "Health endpoint planning" },
    target: { agent: "codex", adapter_version: "codex-cli 0.150.0" },
    project: { id: randomUUID(), name: "sample", root: "/tmp/sample" },
    conversation: {
      selection_mode: "selected",
      messages: [
        { id: "1", role: "user", text: "Add GET /health." },
        { id: "2", role: "assistant", text: "Use a JSON status response and add a test." }
      ]
    },
    task: {
      goal: "Add a health endpoint.",
      constraints: ["Keep the server local-only."],
      acceptance: ["GET /health returns 200."]
    },
    git: {
      branch: "feature/health",
      commit: "1234567890abcdef1234567890abcdef12345678",
      dirty: true,
      changed_files: [{ status: "M", path: "src/server.ts" }],
      diff_stat: "1 file changed, 2 insertions(+)",
      recent_commits: [
        {
          hash: "1234567890abcdef1234567890abcdef12345678",
          subject: "feat: start service",
          committed_at: "2026-08-25T12:00:00.000Z"
        }
      ]
    },
    ...overrides
  };
}

export function requestFixture(projectId: string): CreateHandoffRequest {
  return {
    source: { type: "chatgpt-web", title: "Test conversation" },
    target: "codex",
    project_id: projectId,
    conversation: {
      selection_mode: "selected",
      messages: [{ id: "1", role: "user", text: "Implement the agreed endpoint." }]
    },
    task: { goal: "Implement endpoint.", constraints: [], acceptance: [] },
    include_git: true,
    dry_run: true
  };
}
