import { execFile, spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { promisify } from "node:util";
import type { TargetAgent } from "@contextparcel/protocol";

const execFileAsync = promisify(execFile);

export interface ProcessRunner {
  version(command: string, args: readonly string[]): Promise<string | null>;
  spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcess;
}

export const defaultProcessRunner: ProcessRunner = {
  async version(command, args) {
    try {
      const { stdout, stderr } = await execFileAsync(command, [...args], {
        timeout: 4_000,
        windowsHide: true,
        encoding: "utf8"
      });
      return (stdout || stderr).trim().split(/\r?\n/u)[0] ?? null;
    } catch {
      return null;
    }
  },
  spawn(command, args, options) {
    return spawn(command, [...args], { ...options, shell: false });
  }
};

export interface TargetLaunchResult {
  command: string;
  args: string[];
  pid: number | null;
}

export class AdapterNotInstalledError extends Error {
  constructor(
    public readonly target: TargetAgent,
    public readonly installHint: string
  ) {
    super(`${target} CLI is not installed. ${installHint}`);
    this.name = "AdapterNotInstalledError";
  }
}

export interface TargetAdapter {
  readonly id: TargetAgent;
  detect(): Promise<boolean>;
  version(): Promise<string | null>;
  buildBootstrapPrompt(handoffPath: string): string;
  launch(handoffPath: string, projectRoot: string): Promise<TargetLaunchResult>;
}

export abstract class BaseTargetAdapter implements TargetAdapter {
  abstract readonly id: TargetAgent;
  protected abstract readonly commands: readonly string[];
  protected abstract readonly installHint: string;

  constructor(protected readonly runner: ProcessRunner = defaultProcessRunner) {}

  async detect(): Promise<boolean> {
    return (await this.resolveCommand()) !== null;
  }

  async version(): Promise<string | null> {
    const resolved = await this.resolveCommand();
    return resolved?.version ?? null;
  }

  buildBootstrapPrompt(handoffPath: string): string {
    return [
      "You are continuing a task that was planned in another AI conversation.",
      "",
      `Read the handoff at: ${handoffPath}`,
      "Then inspect the repository from the current working directory.",
      "",
      "Recover the goal, agreed decisions, constraints, acceptance criteria, and repository state.",
      "Do not ask the user to restate information already present in the handoff.",
      "Continue the task from the current repository state."
    ].join("\n");
  }

  async launch(handoffPath: string, projectRoot: string): Promise<TargetLaunchResult> {
    const resolved = await this.resolveCommand();
    if (resolved === null) throw new AdapterNotInstalledError(this.id, this.installHint);

    const args = this.buildArguments(this.buildBootstrapPrompt(handoffPath), projectRoot);
    const child = this.runner.spawn(resolved.command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      windowsHide: false
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });

    return { command: resolved.command, args, pid: child.pid ?? null };
  }

  protected abstract buildArguments(prompt: string, projectRoot: string): string[];

  private async resolveCommand(): Promise<{ command: string; version: string } | null> {
    for (const command of this.commands) {
      const version = await this.runner.version(command, ["--version"]);
      if (version !== null) return { command, version };
    }
    return null;
  }
}
