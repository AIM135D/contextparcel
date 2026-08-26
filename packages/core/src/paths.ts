import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { PathSecurityError, ProjectNotFoundError } from "./errors.js";
import type { RegisteredProject, StateStore } from "./storage.js";

export async function canonicalDirectory(path: string): Promise<string> {
  const canonical = await realpath(resolve(path));
  const details = await stat(canonical);
  if (!details.isDirectory()) throw new PathSecurityError("Project root must be a directory.");
  return canonical;
}

export function isPathInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

export function assertPathInside(root: string, candidate: string): void {
  if (!isPathInside(resolve(root), resolve(candidate))) throw new PathSecurityError();
}

export async function getRegisteredProject(
  store: StateStore,
  projectId: string
): Promise<RegisteredProject> {
  const state = await store.readState();
  const project = state.projects.find((item) => item.id === projectId);
  if (project === undefined) throw new ProjectNotFoundError(projectId);

  const currentRoot = await canonicalDirectory(project.root);
  if (currentRoot !== project.root) {
    throw new PathSecurityError("Registered project root no longer resolves to its original path.");
  }
  return project;
}
