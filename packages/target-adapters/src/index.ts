import type { TargetAgent } from "@contextparcel/protocol";
import type { ProcessRunner, TargetAdapter } from "./base.js";
import { ClaudeAdapter } from "./claude.js";
import { CodexAdapter } from "./codex.js";
import { CursorAdapter } from "./cursor.js";

export * from "./base.js";
export * from "./claude.js";
export * from "./codex.js";
export * from "./cursor.js";

export function createTargetAdapter(target: TargetAgent, runner?: ProcessRunner): TargetAdapter {
  switch (target) {
    case "codex":
      return runner === undefined ? new CodexAdapter() : new CodexAdapter(runner);
    case "claude":
      return runner === undefined ? new ClaudeAdapter() : new ClaudeAdapter(runner);
    case "cursor":
      return runner === undefined ? new CursorAdapter() : new CursorAdapter(runner);
  }
}
