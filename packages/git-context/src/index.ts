import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitChangedFile, GitCommit, GitContext } from "./types.js";

export type { GitChangedFile, GitCommit } from "./types.js";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 5_000;
const MAX_BUFFER = 1_000_000;

async function git(root: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd: root,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    encoding: "utf8"
  });
  return stdout.trimEnd();
}

export function parseShortStatus(output: string): GitChangedFile[] {
  if (output.trim().length === 0) return [];

  return output.split(/\r?\n/u).map((line) => {
    const status = line.slice(0, 2).trim() || "?";
    const rawPath = line.slice(3).trim();
    const renamedPath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : undefined;
    return { status, path: renamedPath ?? rawPath };
  });
}

export function parseLog(output: string): GitCommit[] {
  if (output.trim().length === 0) return [];

  return output.split(/\r?\n/u).flatMap((line) => {
    const [hash, subject, committedAt] = line.split("\t");
    if (hash === undefined || subject === undefined || committedAt === undefined) return [];
    return [{ hash, subject, committed_at: committedAt }];
  });
}

export async function isGitRepository(root: string): Promise<boolean> {
  try {
    return (await git(root, ["rev-parse", "--is-inside-work-tree"])) === "true";
  } catch {
    return false;
  }
}

export async function collectGitContext(root: string): Promise<GitContext | null> {
  if (!(await isGitRepository(root))) return null;

  const [branchResult, commitResult, statusResult, diffStatResult, logResult] =
    await Promise.allSettled([
      git(root, ["branch", "--show-current"]),
      git(root, ["rev-parse", "HEAD"]),
      git(root, ["status", "--short"]),
      git(root, ["diff", "--stat", "--", "."]),
      git(root, ["log", "-5", "--format=%H%x09%s%x09%cI"])
    ]);

  const branch =
    branchResult.status === "fulfilled" && branchResult.value ? branchResult.value : null;
  const commit = commitResult.status === "fulfilled" ? commitResult.value : null;
  const status = statusResult.status === "fulfilled" ? statusResult.value : "";
  const diffStat =
    diffStatResult.status === "fulfilled" && diffStatResult.value ? diffStatResult.value : null;
  const recentCommits = logResult.status === "fulfilled" ? parseLog(logResult.value) : [];
  const changedFiles = parseShortStatus(status);

  return {
    branch,
    commit,
    dirty: changedFiles.length > 0,
    changed_files: changedFiles,
    diff_stat: diffStat,
    recent_commits: recentCommits
  };
}
