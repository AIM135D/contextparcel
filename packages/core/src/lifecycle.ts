import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { ContextParcelError } from "./errors.js";
import { APP_NAME, DEFAULT_HOST } from "./constants.js";
import { StateStore, type DaemonProcessRecord } from "./storage.js";

const START_TIMEOUT_MS = 8_000;
const STOP_TIMEOUT_MS = 6_000;
const POLL_INTERVAL_MS = 100;

export interface DaemonHealth {
  name: string;
  version: string;
  status: "ok";
  instanceId: string | null;
}

export interface DaemonInspection {
  port: number;
  running: boolean;
  managed: boolean;
  staleRecord: boolean;
  pid: number | null;
  instanceId: string | null;
  version: string | null;
}

export interface StartManagedDaemonOptions {
  store?: StateStore;
  port?: number;
  cliPath: string;
  nodePath?: string;
}

export interface StartManagedDaemonResult extends DaemonInspection {
  alreadyRunning: boolean;
}

export interface StopManagedDaemonResult {
  port: number;
  stopped: boolean;
  wasRunning: boolean;
  staleRecordRemoved: boolean;
  pid: number | null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function readDaemonHealth(port: number): Promise<DaemonHealth | null> {
  try {
    const response = await fetch(`http://${DEFAULT_HOST}:${port}/v1/health`, {
      signal: AbortSignal.timeout(1_000)
    });
    if (!response.ok) return null;
    const value = (await response.json()) as Record<string, unknown>;
    if (value.name !== APP_NAME || value.status !== "ok" || typeof value.version !== "string") {
      return null;
    }
    return {
      name: value.name,
      version: value.version,
      status: "ok",
      instanceId: typeof value.instance_id === "string" ? value.instance_id : null
    };
  } catch {
    return null;
  }
}

export async function inspectDaemon(
  store: StateStore = new StateStore()
): Promise<DaemonInspection> {
  const [state, record] = await Promise.all([store.readState(), store.readDaemonRecord()]);
  const health = await readDaemonHealth(state.port);
  const managed =
    health !== null &&
    record !== null &&
    record.port === state.port &&
    health.instanceId === record.instance_id;
  return {
    port: state.port,
    running: health !== null,
    managed,
    staleRecord: record !== null && !managed,
    pid: managed ? record.pid : null,
    instanceId: health?.instanceId ?? null,
    version: health?.version ?? null
  };
}

async function waitForMatchingHealth(
  port: number,
  instanceId: string,
  timeout: number
): Promise<DaemonHealth | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const health = await readDaemonHealth(port);
    if (health?.instanceId === instanceId) return health;
    await delay(POLL_INTERVAL_MS);
  }
  return null;
}

async function waitForDaemonExit(port: number, instanceId: string): Promise<boolean> {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const health = await readDaemonHealth(port);
    if (health?.instanceId !== instanceId) return true;
    await delay(POLL_INTERVAL_MS);
  }
  return false;
}

function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
}

export async function startManagedDaemon(
  options: StartManagedDaemonOptions
): Promise<StartManagedDaemonResult> {
  const store = options.store ?? new StateStore();
  const current = await inspectDaemon(store);
  if (current.running) {
    if (options.port !== undefined && options.port !== current.port) {
      throw new ContextParcelError(
        `Daemon is already running on ${DEFAULT_HOST}:${current.port}. Stop it before changing ports.`,
        "DAEMON_ALREADY_RUNNING"
      );
    }
    return { ...current, alreadyRunning: true };
  }
  if (options.port !== undefined) {
    await store.updateState((state) => ({ ...state, port: options.port ?? state.port }));
  }
  const state = await store.readState();
  if (current.staleRecord) await store.clearDaemonRecord();

  const instanceId = randomUUID();
  const child = spawn(
    options.nodePath ?? process.execPath,
    [
      options.cliPath,
      "serve",
      "--port",
      String(state.port),
      "--managed",
      "--instance-id",
      instanceId
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: process.env
    }
  );
  await waitForSpawn(child);
  const pid = child.pid;
  if (pid === undefined) {
    throw new ContextParcelError("Daemon process did not receive a PID.", "DAEMON_START_FAILED");
  }
  child.unref();

  const health = await waitForMatchingHealth(state.port, instanceId, START_TIMEOUT_MS);
  if (health === null) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The child may already have exited after a bind or startup failure.
    }
    throw new ContextParcelError(
      `Daemon did not become ready on ${DEFAULT_HOST}:${state.port}.`,
      "DAEMON_START_FAILED"
    );
  }

  await store.writeDaemonRecord(daemonRecord(pid, state.port, instanceId));
  return {
    port: state.port,
    running: true,
    managed: true,
    staleRecord: false,
    pid,
    instanceId,
    version: health.version,
    alreadyRunning: false
  };
}

export async function stopManagedDaemon(
  store: StateStore = new StateStore()
): Promise<StopManagedDaemonResult> {
  const [state, record] = await Promise.all([store.readState(), store.readDaemonRecord()]);
  const health = await readDaemonHealth(state.port);

  if (health === null) {
    if (record !== null) await store.clearDaemonRecord(record.instance_id);
    return {
      port: state.port,
      stopped: false,
      wasRunning: false,
      staleRecordRemoved: record !== null,
      pid: null
    };
  }

  if (record === null || health.instanceId !== record.instance_id || record.port !== state.port) {
    throw new ContextParcelError(
      "A foreground or unmanaged ContextParcel daemon is running. Stop it in its terminal with Ctrl+C.",
      "DAEMON_NOT_MANAGED"
    );
  }

  try {
    process.kill(record.pid, "SIGTERM");
  } catch (error) {
    throw new ContextParcelError(
      `Could not signal daemon PID ${record.pid}: ${error instanceof Error ? error.message : String(error)}`,
      "DAEMON_STOP_FAILED"
    );
  }

  if (!(await waitForDaemonExit(state.port, record.instance_id))) {
    throw new ContextParcelError(
      `Daemon PID ${record.pid} did not stop within ${STOP_TIMEOUT_MS / 1_000} seconds.`,
      "DAEMON_STOP_FAILED"
    );
  }
  await store.clearDaemonRecord(record.instance_id);
  return {
    port: state.port,
    stopped: true,
    wasRunning: true,
    staleRecordRemoved: false,
    pid: record.pid
  };
}

export function daemonRecord(pid: number, port: number, instanceId: string): DaemonProcessRecord {
  return {
    version: 1,
    pid,
    port,
    instance_id: instanceId,
    started_at: new Date().toISOString()
  };
}
