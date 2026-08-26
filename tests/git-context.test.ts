import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { collectGitContext, parseLog, parseShortStatus } from "@contextparcel/git-context";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("Git context", () => {
  it("parses short status including renames", () => {
    expect(parseShortStatus(" M src/a.ts\n?? notes.txt\nR  old.ts -> new.ts")).toEqual([
      { status: "M", path: "src/a.ts" },
      { status: "??", path: "notes.txt" },
      { status: "R", path: "new.ts" }
    ]);
  });

  it("parses recent commit records", () => {
    expect(parseLog("abcdef123\tfeat: test\t2026-08-26T10:00:00+08:00")).toEqual([
      { hash: "abcdef123", subject: "feat: test", committed_at: "2026-08-26T10:00:00+08:00" }
    ]);
  });

  it("collects a real temporary repository without modifying it", async () => {
    const root = await mkdtemp(join(tmpdir(), "contextparcel-git-"));
    temporaryDirectories.push(root);
    await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await execFileAsync("git", ["config", "user.name", "ContextParcel Test"], { cwd: root });
    await writeFile(join(root, "README.md"), "initial\n");
    await execFileAsync("git", ["add", "README.md"], { cwd: root });
    await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root });
    await writeFile(join(root, "README.md"), "changed\n");

    const context = await collectGitContext(root);
    expect(context?.branch).toBe("main");
    expect(context?.dirty).toBe(true);
    expect(context?.changed_files).toContainEqual({ status: "M", path: "README.md" });
    expect(context?.recent_commits[0]?.subject).toBe("initial");
    expect(await execFileAsync("git", ["status", "--short"], { cwd: root })).toHaveProperty(
      "stdout",
      " M README.md\n"
    );
  });
});
