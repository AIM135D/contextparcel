import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { canonicalDirectory } from "./paths.js";
import type { RegisteredProject, StateStore } from "./storage.js";

const GITIGNORE_BLOCK = [
  "# ContextParcel private handoff data",
  ".contextparcel/handoffs/*",
  "!.contextparcel/handoffs/.gitkeep"
].join("\n");

async function updateGitignore(root: string): Promise<void> {
  const path = join(root, ".gitignore");
  let current = "";
  try {
    current = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (current.includes("# ContextParcel private handoff data")) return;
  const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  await writeFile(path, `${current}${separator}${GITIGNORE_BLOCK}\n`, "utf8");
}

export async function initializeProject(
  store: StateStore,
  requestedRoot: string,
  requestedName?: string
): Promise<RegisteredProject> {
  const root = await canonicalDirectory(requestedRoot);
  const state = await store.readState();
  const existing = state.projects.find((project) => project.root === root);
  const name = requestedName?.trim() || basename(root);
  const project: RegisteredProject = existing ?? {
    id: randomUUID(),
    name,
    root,
    created_at: new Date().toISOString()
  };

  if (existing === undefined) {
    state.projects.push(project);
    await store.writeState(state);
  }

  const projectDirectory = join(root, ".contextparcel");
  const handoffDirectory = join(projectDirectory, "handoffs");
  await mkdir(handoffDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    join(projectDirectory, "config.json"),
    `${JSON.stringify({ version: 1, project_id: project.id, name: project.name, root }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(join(handoffDirectory, ".gitkeep"), "", { flag: "a" });
  await updateGitignore(root);
  return project;
}

export async function listProjects(store: StateStore): Promise<RegisteredProject[]> {
  return (await store.readState()).projects;
}
