import { BaseTargetAdapter } from "./base.js";

export class CursorAdapter extends BaseTargetAdapter {
  readonly id = "cursor" as const;
  protected readonly commands = ["agent", "cursor-agent"] as const;
  protected readonly installHint = "Install Cursor CLI from https://cursor.com/docs/cli/overview.";

  protected buildArguments(prompt: string): string[] {
    return [prompt];
  }
}
