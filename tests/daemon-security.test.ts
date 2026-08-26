import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  StateStore,
  initializeProject,
  issuePairingCode,
  startDaemon,
  type RunningDaemon,
  type TargetFactory
} from "@contextparcel/core";
import type { TargetAdapter } from "@contextparcel/targets";
import type { TargetAgent } from "@contextparcel/protocol";
import { requestFixture } from "./fixtures";

const extensionId = "a".repeat(32);
const extensionOrigin = `chrome-extension://${extensionId}`;
const temporaryDirectories: string[] = [];
let daemon: RunningDaemon;
let store: StateStore;
let projectId: string;

const targetFactory: TargetFactory = (target: TargetAgent): TargetAdapter => ({
  id: target,
  detect: () => Promise.resolve(true),
  version: () => Promise.resolve("mock 1.0"),
  buildBootstrapPrompt: (path) => `Read ${path}`,
  launch: () => Promise.resolve({ command: target, args: [], pid: 1 })
});

async function api(
  path: string,
  options: { origin?: string; token?: string; body?: unknown; method?: "GET" | "POST" } = {}
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.origin !== undefined) headers.Origin = options.origin;
  if (options.token !== undefined) headers.Authorization = `Bearer ${options.token}`;
  const init: RequestInit = { method: options.method ?? "POST", headers };
  if (init.method === "POST") init.body = JSON.stringify(options.body ?? {});
  return fetch(`http://127.0.0.1:${daemon.port}${path}`, init);
}

async function pair(): Promise<string> {
  const { code } = await issuePairingCode(store);
  const response = await api("/v1/pair", {
    origin: extensionOrigin,
    body: { code, extension_id: extensionId }
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { token: string }).token;
}

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "contextparcel-daemon-project-"));
  const stateDirectory = await mkdtemp(join(tmpdir(), "contextparcel-daemon-state-"));
  temporaryDirectories.push(root, stateDirectory);
  store = new StateStore({ stateDirectory });
  projectId = (await initializeProject(store, root)).id;
  daemon = await startDaemon({ port: 0, store, targetFactory });
});

afterEach(async () => {
  await daemon.close();
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("localhost daemon security", () => {
  it("rejects requests without a pairing token", async () => {
    const response = await api("/v1/projects", { origin: extensionOrigin });
    expect(response.status).toBe(403);
  });

  it("rejects pairing from a normal website origin", async () => {
    const { code } = await issuePairingCode(store);
    const response = await api("/v1/pair", {
      origin: "https://malicious.example",
      body: { code, extension_id: extensionId }
    });
    expect(response.status).toBe(403);
  });

  it("rejects invalid tokens and mismatched origins", async () => {
    const token = await pair();
    expect((await api("/v1/projects", { origin: extensionOrigin, token: "wrong" })).status).toBe(
      401
    );
    expect(
      (
        await api("/v1/projects", {
          origin: `chrome-extension://${"b".repeat(32)}`,
          token
        })
      ).status
    ).toBe(403);
  });

  it("rejects malformed payloads and browser-supplied traversal paths", async () => {
    const token = await pair();
    const malformed = await api("/v1/preview", {
      origin: extensionOrigin,
      token,
      body: { messages: "not-an-array" }
    });
    expect(malformed.status).toBe(400);

    const traversal = await api("/v1/preview", {
      origin: extensionOrigin,
      token,
      body: { ...requestFixture(projectId), project_root: "../../../private" }
    });
    expect(traversal.status).toBe(400);
  });

  it("accepts shell-like conversation text only as packet data", async () => {
    const token = await pair();
    const request = requestFixture(projectId);
    request.conversation.messages = [{ role: "user", text: '"; rm -rf ~; echo "owned' }];
    const response = await api("/v1/handoffs", {
      origin: extensionOrigin,
      token,
      body: request
    });
    expect(response.status).toBe(201);
    expect((await response.json()) as object).toMatchObject({ target: "codex", launched: false });
  });
});
