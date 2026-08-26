import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StateStore, daemonRecord, stopManagedDaemon } from "@contextparcel/core";

const temporaryDirectories: string[] = [];

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No TCP port assigned.");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  );
  return address.port;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("managed daemon lifecycle", () => {
  it("removes a stale PID record without signalling an unrelated process", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "contextparcel-lifecycle-"));
    temporaryDirectories.push(stateDirectory);
    const store = new StateStore({ stateDirectory });
    const port = await unusedPort();
    await store.updateState((state) => ({ ...state, port }));
    await store.writeDaemonRecord(daemonRecord(999_999, port, crypto.randomUUID()));
    const kill = vi.spyOn(process, "kill");

    await expect(stopManagedDaemon(store)).resolves.toMatchObject({
      stopped: false,
      staleRecordRemoved: true,
      pid: null
    });
    expect(kill).not.toHaveBeenCalled();
    expect(await store.readDaemonRecord()).toBeNull();
  });
});
