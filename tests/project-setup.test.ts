import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StateStore, initializeProject } from "@contextparcel/core";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("project setup", () => {
  it("is idempotent and preserves an existing project config", async () => {
    const root = await mkdtemp(join(tmpdir(), "Context Parcel 项目 with spaces-"));
    const stateDirectory = await mkdtemp(join(tmpdir(), "Context Parcel 状态 with spaces-"));
    temporaryDirectories.push(root, stateDirectory);
    const store = new StateStore({ stateDirectory });
    const first = await initializeProject(store, root, "示例 project");
    const configPath = join(root, ".contextparcel", "config.json");
    const customized = '{"customized":true}\n';
    await writeFile(configPath, customized, "utf8");

    const second = await initializeProject(store, root, "ignored new name");
    expect(second).toEqual(first);
    expect((await store.readState()).projects).toEqual([first]);
    expect(await readFile(configPath, "utf8")).toBe(customized);
    const gitignore = await readFile(join(root, ".gitignore"), "utf8");
    expect(gitignore.match(/# ContextParcel private handoff data/gu)).toHaveLength(1);
  });

  it("does not lose projects during concurrent in-process registration", async () => {
    const rootOne = await mkdtemp(join(tmpdir(), "contextparcel-project-one-"));
    const rootTwo = await mkdtemp(join(tmpdir(), "contextparcel-project-two-"));
    const stateDirectory = await mkdtemp(join(tmpdir(), "contextparcel-state-"));
    temporaryDirectories.push(rootOne, rootTwo, stateDirectory);
    const store = new StateStore({ stateDirectory });

    const projects = await Promise.all([
      initializeProject(store, rootOne),
      initializeProject(store, rootTwo)
    ]);
    expect((await store.readState()).projects.map((project) => project.id).sort()).toEqual(
      projects.map((project) => project.id).sort()
    );
  });
});
