import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  ClaudeAdapter,
  CodexAdapter,
  CursorAdapter,
  type ProcessRunner
} from "@contextparcel/targets";

class FakeRunner implements ProcessRunner {
  readonly versionCalls: string[] = [];
  readonly spawnCalls: Array<{ command: string; args: readonly string[]; options: SpawnOptions }> =
    [];

  constructor(private readonly available: Record<string, string> = {}) {}

  version(command: string): Promise<string | null> {
    this.versionCalls.push(command);
    return Promise.resolve(this.available[command] ?? null);
  }

  spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcess {
    this.spawnCalls.push({ command, args, options });
    const child = new EventEmitter() as ChildProcess;
    Object.defineProperty(child, "pid", { value: 4321 });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  }
}

describe("target adapters", () => {
  it("builds a Codex prompt and launches with explicit argv boundaries", async () => {
    const runner = new FakeRunner({ codex: "codex-cli 1.0.0" });
    const adapter = new CodexAdapter(runner);
    const maliciousPath = '/tmp/handoff-"; rm -rf ~; ".md';
    const result = await adapter.launch(maliciousPath, "/tmp/project");
    const call = runner.spawnCalls[0];
    expect(result.command).toBe("codex");
    expect(call?.args).toHaveLength(3);
    expect(call?.args[0]).toBe("--cd");
    expect(call?.args[2]).toContain(maliciousPath);
    expect(call?.options.shell).not.toBe(true);
  });

  it("uses the supported initial prompt form for Claude Code", async () => {
    const runner = new FakeRunner({ claude: "2.1.0" });
    await new ClaudeAdapter(runner).launch("/tmp/handoff.md", "/tmp/project");
    expect(runner.spawnCalls[0]?.command).toBe("claude");
    expect(runner.spawnCalls[0]?.args).toHaveLength(1);
  });

  it("falls back from agent to cursor-agent", async () => {
    const runner = new FakeRunner({ "cursor-agent": "2026.08" });
    const adapter = new CursorAdapter(runner);
    expect(await adapter.version()).toBe("2026.08");
    expect(runner.versionCalls).toEqual(["agent", "cursor-agent"]);
  });

  it("does not launch when the target is missing", async () => {
    const runner = new FakeRunner();
    await expect(
      new ClaudeAdapter(runner).launch("/tmp/handoff.md", "/tmp/project")
    ).rejects.toThrow("not installed");
    expect(runner.spawnCalls).toHaveLength(0);
  });
});
