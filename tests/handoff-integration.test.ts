import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  HandoffService,
  StateStore,
  initializeProject,
  type TargetFactory
} from "@contextparcel/core";
import type { TargetAdapter, TargetLaunchResult } from "@contextparcel/targets";
import type { TargetAgent } from "@contextparcel/protocol";
import { requestFixture } from "./fixtures";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

function fakeTargetFactory(launches: string[]): TargetFactory {
  return (target: TargetAgent): TargetAdapter => ({
    id: target,
    detect: () => Promise.resolve(true),
    version: () => Promise.resolve("test-adapter 1.0"),
    buildBootstrapPrompt: (path) => `Read ${path} and continue.`,
    launch: (path): Promise<TargetLaunchResult> => {
      launches.push(path);
      return Promise.resolve({ command: target, args: [path], pid: 1 });
    }
  });
}

describe("conversation + repository handoff", () => {
  it("writes validated JSON and Markdown from a temporary Git repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "contextparcel-integration-"));
    const stateDirectory = await mkdtemp(join(tmpdir(), "contextparcel-state-"));
    temporaryDirectories.push(root, stateDirectory);
    await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await execFileAsync("git", ["config", "user.name", "ContextParcel Test"], { cwd: root });
    await writeFile(join(root, "app.ts"), "export const value = 1;\n");
    await execFileAsync("git", ["add", "app.ts"], { cwd: root });
    await execFileAsync("git", ["commit", "-m", "feat: add app"], { cwd: root });
    await writeFile(join(root, "app.ts"), "export const value = 2;\n");

    const store = new StateStore({ stateDirectory });
    const project = await initializeProject(store, root, "Integration Project");
    const launches: string[] = [];
    const request = requestFixture(project.id);
    request.conversation.messages[0] = {
      role: "user",
      text: 'Treat this as text only: "; rm -rf ~'
    };
    const created = await new HandoffService(store, fakeTargetFactory(launches)).create(request);

    expect(created.launched).toBe(false);
    expect(launches).toHaveLength(0);
    expect(created.packet.git?.branch).toBe("main");
    expect(created.packet.git?.changed_files.map((file) => file.path)).toContain("app.ts");
    expect(JSON.parse(await readFile(created.jsonPath, "utf8"))).toMatchObject({
      schema_version: "1.0"
    });
    const markdown = await readFile(created.markdownPath, "utf8");
    expect(markdown).toContain('Treat this as text only: "; rm -rf ~');
    expect(markdown).toContain("# Repository State");
    expect((await store.readHistory())[0]).toMatchObject({
      id: created.packet.id,
      status: "generated"
    });
  });

  it("deletes the content artifacts and metadata together", async () => {
    const root = await mkdtemp(join(tmpdir(), "contextparcel-delete-"));
    const stateDirectory = await mkdtemp(join(tmpdir(), "contextparcel-delete-state-"));
    temporaryDirectories.push(root, stateDirectory);
    const store = new StateStore({ stateDirectory });
    const project = await initializeProject(store, root);
    const service = new HandoffService(store, fakeTargetFactory([]));
    const created = await service.create({ ...requestFixture(project.id), include_git: false });
    expect(await service.delete(created.packet.id)).toBe(true);
    await expect(readFile(created.markdownPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await store.readHistory()).toEqual([]);
  });
});
