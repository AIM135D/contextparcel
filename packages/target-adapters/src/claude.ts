import { BaseTargetAdapter } from "./base.js";

export class ClaudeAdapter extends BaseTargetAdapter {
  readonly id = "claude" as const;
  protected readonly commands = ["claude"] as const;
  protected readonly installHint =
    "Install Claude Code from https://docs.anthropic.com/en/docs/claude-code/overview.";

  protected buildArguments(prompt: string): string[] {
    return [prompt];
  }
}
