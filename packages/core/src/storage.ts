import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

  constructor(options: StateStoreOptions = {}) {
    this.stateDirectory =
      options.stateDirectory ?? process.env.CONTEXTPARCEL_HOME ?? join(homedir(), ".contextparcel");
    this.statePath = join(this.stateDirectory, "state.json");
    this.historyPath = join(this.stateDirectory, "history.json");
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
    const next = await update(await this.readState());
    await this.writeState(next);
    return next;
  }

  async readHistory(): Promise<HistoryRecord[]> {
    return this.readJson(this.historyPath, []);
  }

  async writeHistory(history: HistoryRecord[]): Promise<void> {
    await this.writeJson(this.historyPath, history);
  }

  async upsertHistory(record: HistoryRecord): Promise<void> {
    const history = await this.readHistory();
    const existing = history.findIndex((item) => item.id === record.id);
    if (existing === -1) history.unshift(record);
    else history[existing] = record;
    await this.writeHistory(history);
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
    const temporaryPath = `${path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  }
}
