import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { collectGitContext } from "@contextparcel/git-context";
import {
  HandoffPacketSchema,
  SCHEMA_VERSION,
  type CreateHandoffRequest,
  type HandoffPacket,
  type TargetAgent
} from "@contextparcel/protocol";
import { createTargetAdapter, type TargetAdapter } from "@contextparcel/targets";
import { ContextParcelError } from "./errors.js";
import { generateHandoffMarkdown } from "./markdown.js";
import { assertPathInside, getRegisteredProject } from "./paths.js";
import type { HistoryRecord, StateStore } from "./storage.js";

export interface HandoffPreview {
  messages: number;
  user_messages: number;
  assistant_messages: number;
  project: { id: string; name: string };
  git: { branch: string | null; changed_files: number; dirty: boolean } | null;
  target: TargetAgent;
  target_available: boolean;
  target_version: string | null;
}

export interface CreatedHandoff {
  packet: HandoffPacket;
  handoffDirectory: string;
  jsonPath: string;
  markdownPath: string;
  bootstrapPrompt: string;
  launched: boolean;
}

export type TargetFactory = (target: TargetAgent) => TargetAdapter;

export class HandoffService {
  constructor(
    private readonly store: StateStore,
    private readonly targetFactory: TargetFactory = createTargetAdapter
  ) {}

  async preview(request: CreateHandoffRequest): Promise<HandoffPreview> {
    const project = await getRegisteredProject(this.store, request.project_id);
    const [git, adapterVersion] = await Promise.all([
      request.include_git ? collectGitContext(project.root) : Promise.resolve(null),
      this.targetFactory(request.target).version()
    ]);
    return {
      messages: request.conversation.messages.length,
      user_messages: request.conversation.messages.filter((message) => message.role === "user")
        .length,
      assistant_messages: request.conversation.messages.filter(
        (message) => message.role === "assistant"
      ).length,
      project: { id: project.id, name: project.name },
      git:
        git === null
          ? null
          : { branch: git.branch, changed_files: git.changed_files.length, dirty: git.dirty },
      target: request.target,
      target_available: adapterVersion !== null,
      target_version: adapterVersion
    };
  }

  async create(request: CreateHandoffRequest): Promise<CreatedHandoff> {
    const project = await getRegisteredProject(this.store, request.project_id);
    const adapter = this.targetFactory(request.target);
    const [git, adapterVersion] = await Promise.all([
      request.include_git ? collectGitContext(project.root) : Promise.resolve(null),
      adapter.version()
    ]);

    const packet = HandoffPacketSchema.parse({
      schema_version: SCHEMA_VERSION,
      id: randomUUID(),
      created_at: new Date().toISOString(),
      source: request.source,
      target: {
        agent: request.target,
        adapter_version: adapterVersion ?? "not-installed"
      },
      project: { id: project.id, name: project.name, root: project.root },
      conversation: request.conversation,
      task: {
        goal: request.task?.goal ?? null,
        constraints: request.task?.constraints ?? [],
        acceptance: request.task?.acceptance ?? []
      },
      git
    });

    const handoffDirectory = resolve(project.root, ".contextparcel", "handoffs", packet.id);
    assertPathInside(project.root, handoffDirectory);
    await mkdir(handoffDirectory, { recursive: false, mode: 0o700 });
    const jsonPath = join(handoffDirectory, "handoff.json");
    const markdownPath = join(handoffDirectory, "handoff.md");
    await writeFile(jsonPath, `${JSON.stringify(packet, null, 2)}\n`, { mode: 0o600 });
    await writeFile(markdownPath, generateHandoffMarkdown(packet), { mode: 0o600 });

    const history: HistoryRecord = {
      id: packet.id,
      created_at: packet.created_at,
      source: packet.source.type,
      target: packet.target.agent,
      project_id: packet.project.id,
      project_name: packet.project.name,
      status: "generated",
      handoff_dir: handoffDirectory
    };
    await this.store.upsertHistory(history);

    const bootstrapPrompt = adapter.buildBootstrapPrompt(markdownPath);
    if (request.dry_run) {
      return {
        packet,
        handoffDirectory,
        jsonPath,
        markdownPath,
        bootstrapPrompt,
        launched: false
      };
    }

    try {
      await adapter.launch(markdownPath, project.root);
      await this.store.upsertHistory({ ...history, status: "launched" });
      return {
        packet,
        handoffDirectory,
        jsonPath,
        markdownPath,
        bootstrapPrompt,
        launched: true
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown target launch error";
      await this.store.upsertHistory({ ...history, status: "failed", error: message });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const history = await this.store.readHistory();
    const record = history.find((item) => item.id === id);
    if (record === undefined) return false;
    const project = await getRegisteredProject(this.store, record.project_id);
    const expected = resolve(project.root, ".contextparcel", "handoffs", id);
    assertPathInside(project.root, expected);
    if (resolve(record.handoff_dir) !== expected) {
      throw new ContextParcelError(
        "History path did not match the registered project.",
        "HISTORY_TAMPERED",
        403
      );
    }
    await rm(expected, { recursive: true, force: false });
    await this.store.writeHistory(history.filter((item) => item.id !== id));
    return true;
  }

  async clear(): Promise<number> {
    const history = await this.store.readHistory();
    let deleted = 0;
    for (const record of history) {
      try {
        if (await this.delete(record.id)) deleted += 1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const remaining = (await this.store.readHistory()).filter((item) => item.id !== record.id);
        await this.store.writeHistory(remaining);
      }
    }
    return deleted;
  }
}
