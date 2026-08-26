import { BaseTargetAdapter } from "./base.js";

export class CodexAdapter extends BaseTargetAdapter {
  readonly id = "codex" as const;
  protected readonly commands = ["codex"] as const;
  protected readonly installHint =
    "Install Codex CLI from https://developers.openai.com/codex/cli/.";

  protected buildArguments(prompt: string, projectRoot: string): string[] {
    return ["--cd", projectRoot, prompt];
  }
}
