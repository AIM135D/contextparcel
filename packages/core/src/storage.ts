import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { STATE_SCHEMA_VERSION } from "./constants.js";

export interface RegisteredProject {
  id: string;
  name: string;
  root: string;
  created_at: string;
}

export interface PairCodeRecord {
  hash: string;
  expires_at: string;
  attempts?: number;
}

export interface PairingRecord {
  extension_id: string;
  origin: string;
  token_hash: string;
  paired_at: string;
}

export interface GlobalState {
  version: 1;
  port: number;
  projects: RegisteredProject[];
  pair_code?: PairCodeRecord;
  pairings: PairingRecord[];
}

export interface HistoryRecord {
  id: string;
  created_at: string;
  source: string;
  target: string;
  project_id: string;
  project_name: string;
  status: "generated" | "launched" | "failed";
  handoff_dir: string;
  error?: string;
}

export interface DaemonProcessRecord {
  version: 1;
  pid: number;
  port: number;
  instance_id: string;
  started_at: string;
}

export interface StateStoreOptions {
  stateDirectory?: string;
}

function initialState(): GlobalState {
  return {
    version: STATE_SCHEMA_VERSION,
    port: 37_421,
    projects: [],
    pairings: []
  };
}

export class StateStore {
  readonly stateDirectory: string;
  readonly statePath: string;
  readonly historyPath: string;
  readonly daemonPath: string;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(options: StateStoreOptions = {}) {
    this.stateDirectory =
      options.stateDirectory ?? process.env.CONTEXTPARCEL_HOME ?? join(homedir(), ".contextparcel");
    this.statePath = join(this.stateDirectory, "state.json");
    this.historyPath = join(this.stateDirectory, "history.json");
    this.daemonPath = join(this.stateDirectory, "daemon.json");
  }

  async readState(): Promise<GlobalState> {
    return this.readJson(this.statePath, initialState());
  }

  async writeState(state: GlobalState): Promise<void> {
    await this.writeJson(this.statePath, state);
  }

  async updateState(
    update: (state: GlobalState) => GlobalState | Promise<GlobalState>
  ): Promise<GlobalState> {
    return this.withMutationLock(async () => {
      const next = await update(await this.readState());
      await this.writeState(next);
      return next;
    });
  }

  async readHistory(): Promise<HistoryRecord[]> {
    return this.readJson(this.historyPath, []);
  }

  async writeHistory(history: HistoryRecord[]): Promise<void> {
    await this.writeJson(this.historyPath, history);
  }

  async upsertHistory(record: HistoryRecord): Promise<void> {
    await this.withMutationLock(async () => {
      const history = await this.readHistory();
      const existing = history.findIndex((item) => item.id === record.id);
      if (existing === -1) history.unshift(record);
      else history[existing] = record;
      await this.writeHistory(history);
    });
  }

  async readDaemonRecord(): Promise<DaemonProcessRecord | null> {
    return this.readJson(this.daemonPath, null);
  }

  async writeDaemonRecord(record: DaemonProcessRecord): Promise<void> {
    await this.writeJson(this.daemonPath, record);
  }

  async clearDaemonRecord(expectedInstanceId?: string): Promise<boolean> {
    const record = await this.readDaemonRecord();
    if (record === null) return false;
    if (expectedInstanceId !== undefined && record.instance_id !== expectedInstanceId) return false;
    await rm(this.daemonPath, { force: true });
    return true;
  }

  private async readJson<T>(path: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
      throw error;
    }
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  }

  private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release: () => void = () => undefined;
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
