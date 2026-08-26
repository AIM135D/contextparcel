import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { Command, InvalidArgumentError } from "commander";
import {
  APP_NAME,
  APP_VERSION,
  DEFAULT_HOST,
  DEFAULT_PORT,
  HandoffService,
  StateStore,
  initializeProject,
  issuePairingCode,
  listProjects,
  startDaemon,
  type RegisteredProject
} from "@contextparcel/core";
import {
  CreateHandoffRequestSchema,
  TARGET_AGENTS,
  type ConversationMessage
} from "@contextparcel/protocol";
import { createTargetAdapter } from "@contextparcel/targets";

const execFileAsync = promisify(execFile);

function targetValue(value: string): (typeof TARGET_AGENTS)[number] {
  if (TARGET_AGENTS.includes(value as (typeof TARGET_AGENTS)[number])) {
    return value as (typeof TARGET_AGENTS)[number];
  }
  throw new InvalidArgumentError(`Target must be one of: ${TARGET_AGENTS.join(", ")}`);
}

async function daemonHealth(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://${DEFAULT_HOST}:${port}/v1/health`, {
      signal: AbortSignal.timeout(1_000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function commandVersion(command: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(command, ["--version"], {
      timeout: 3_000,
      windowsHide: true,
      encoding: "utf8"
    });
    return (stdout || stderr).trim().split(/\r?\n/u)[0] ?? null;
  } catch {
    return null;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function parseConversationInput(text: string): ConversationMessage[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error("Conversation input is empty.");
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed as ConversationMessage[];
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "messages" in parsed &&
      Array.isArray(parsed.messages)
    ) {
      return parsed.messages as ConversationMessage[];
    }
  } catch {
    // Plain text is a valid single user message.
  }
  return [{ role: "user", text: trimmed }];
}

async function selectProject(store: StateStore, selector?: string): Promise<RegisteredProject> {
  const projects = await listProjects(store);
  if (selector !== undefined) {
    const match = projects.find((project) => project.id === selector || project.name === selector);
    if (match !== undefined) return match;
    throw new Error(`Project is not registered: ${selector}`);
  }
  const currentRoot = resolve(process.cwd());
  const current = projects.find((project) => project.root === currentRoot);
  if (current !== undefined) return current;
  if (projects.length === 1 && projects[0] !== undefined) return projects[0];
  throw new Error("Choose a registered project with --project <id-or-name>.");
}

function printHistory(records: Awaited<ReturnType<StateStore["readHistory"]>>): void {
  if (records.length === 0) {
    console.log("No handoffs yet.");
    return;
  }
  console.table(
    records.map((record) => ({
      ID: record.id,
      Date: record.created_at,
      Source: record.source,
      Target: record.target,
      Project: record.project_name,
      Status: record.status
    }))
  );
}

const program = new Command();
program
  .name("contextparcel")
  .description("Local-first context handoff from web AI conversations to coding agents.")
  .version(APP_VERSION);

program
  .command("init")
  .description("Initialize and register the current project")
  .argument("[path]", "project root", ".")
  .option("--name <name>", "project display name")
  .action(async (path: string, options: { name?: string }) => {
    const project = await initializeProject(new StateStore(), path, options.name);
    console.log(`${APP_NAME} initialized ${project.name}`);
    console.log(`Project ID: ${project.id}`);
    console.log(`Root: ${project.root}`);
    console.log(
      "Private handoffs will be written under .contextparcel/handoffs/ and ignored by Git."
    );
  });

program
  .command("serve")
  .description("Start the local-only handoff daemon")
  .option("-p, --port <port>", "localhost port", String(DEFAULT_PORT))
  .action(async (options: { port: string }) => {
    const port = Number.parseInt(options.port, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65_535)
      throw new Error("Port must be 1-65535.");
    const store = new StateStore();
    await store.updateState((state) => ({ ...state, port }));
    const daemon = await startDaemon({ port, store });
    console.log(`${APP_NAME} is listening on http://${daemon.host}:${daemon.port}`);
    console.log("Conversations stay on this machine. Press Ctrl+C to stop.");

    await new Promise<void>((resolveShutdown) => {
      let closing = false;
      const shutdown = (): void => {
        if (closing) return;
        closing = true;
        void daemon.close().finally(resolveShutdown);
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
  });

program
  .command("status")
  .description("Show daemon, pairing, and project status")
  .action(async () => {
    const store = new StateStore();
    const state = await store.readState();
    console.log(`${APP_NAME} ${APP_VERSION}`);
    console.log(`Daemon: ${(await daemonHealth(state.port)) ? "running" : "stopped"}`);
    console.log(`Extension pairings: ${state.pairings.length}`);
    console.log(`Projects: ${state.projects.length}`);
  });

program
  .command("pair")
  .description("Create a one-time browser extension pairing code")
  .action(async () => {
    const pair = await issuePairingCode(new StateStore());
    console.log(`Pairing code: ${pair.code}`);
    console.log(`Expires: ${pair.expiresAt}`);
    console.log("Enter this code in the ContextParcel extension. It can be used once.");
  });

program
  .command("doctor")
  .description("Check local dependencies and ContextParcel setup")
  .action(async () => {
    const store = new StateStore();
    const state = await store.readState();
    const [git, codex, claude, cursor, daemon] = await Promise.all([
      commandVersion("git"),
      createTargetAdapter("codex").version(),
      createTargetAdapter("claude").version(),
      createTargetAdapter("cursor").version(),
      daemonHealth(state.port)
    ]);
    const row = (name: string, value: string | null | boolean): void => {
      const display =
        value === true ? "✓" : value === false || value === null ? "✗ not installed" : `✓ ${value}`;
      console.log(`${name.padEnd(14)} ${display}`);
    };
    console.log(`${APP_NAME} Doctor\n`);
    row("Node", process.version);
    row("Git", git);
    row("Codex", codex);
    row("Claude Code", claude);
    row("Cursor", cursor);
    row("Daemon", daemon);
    console.log(
      `${"Extension".padEnd(14)} ${state.pairings.length > 0 ? "✓ paired" : "✗ not paired"}`
    );
    console.log(`${"Projects".padEnd(14)} ${state.projects.length}`);
  });

program
  .command("history")
  .description("List local handoff metadata")
  .action(async () => {
    printHistory(await new StateStore().readHistory());
  });

program
  .command("delete")
  .description("Delete one handoff and its local conversation artifacts")
  .argument("<id>", "handoff ID")
  .action(async (id: string) => {
    const deleted = await new HandoffService(new StateStore()).delete(id);
    if (!deleted) throw new Error(`Handoff not found: ${id}`);
    console.log(`Deleted handoff ${id}.`);
  });

program
  .command("clear")
  .description("Delete all handoff artifacts and history metadata")
  .action(async () => {
    const deleted = await new HandoffService(new StateStore()).clear();
    console.log(`Deleted ${deleted} handoff${deleted === 1 ? "" : "s"}.`);
  });

program
  .command("send")
  .description("Create a handoff from a file, message, or stdin and optionally launch an agent")
  .option("-t, --target <target>", "codex, claude, or cursor", targetValue, "codex")
  .option("-p, --project <project>", "registered project ID or name")
  .option("-f, --file <path>", "text or JSON conversation file")
  .option("-m, --message <message>", "single user message")
  .option("--goal <goal>", "current task goal")
  .option("--dry-run", "generate packet and bootstrap prompt without launching", false)
  .option("--no-git", "exclude Git context")
  .action(
    async (options: {
      target: (typeof TARGET_AGENTS)[number];
      project?: string;
      file?: string;
      message?: string;
      goal?: string;
      dryRun: boolean;
      git: boolean;
    }) => {
      const store = new StateStore();
      const project = await selectProject(store, options.project);
      let input: string;
      if (options.file !== undefined) input = await readFile(resolve(options.file), "utf8");
      else if (options.message !== undefined) input = options.message;
      else if (!process.stdin.isTTY) input = await readStdin();
      else throw new Error("Provide --file, --message, or pipe conversation text on stdin.");

      const request = CreateHandoffRequestSchema.parse({
        source: { type: "cli", title: options.file ? basename(options.file) : "CLI handoff" },
        target: options.target,
        project_id: project.id,
        conversation: { selection_mode: "cli", messages: parseConversationInput(input) },
        task: { goal: options.goal ?? null, constraints: [], acceptance: [] },
        include_git: options.git,
        dry_run: options.dryRun
      });
      const created = await new HandoffService(store).create(request);
      console.log(`Handoff JSON: ${created.jsonPath}`);
      console.log(`Handoff Markdown: ${created.markdownPath}`);
      if (options.dryRun) console.log(`\nBootstrap prompt:\n\n${created.bootstrapPrompt}`);
      else
        console.log(`Target ${created.launched ? "launched" : "not launched"}: ${options.target}`);
    }
  );

program
  .command("demo")
  .description("Print a sample handoff without installing an agent")
  .action(() => {
    console.log(`# Mission

Add a health endpoint to a small TypeScript service.

# Conversation Context

## User

Use GET /health and return { "status": "ok" }. Keep the service local-only.

## Assistant

Agreed: implement the endpoint, validate it with an integration test, and do not add a database.

# Decisions / Constraints

- Bind to 127.0.0.1.
- No database or external API.

# Repository State

Branch: feature/health; two changed files; working tree is dirty.

# Pickup Instructions

Inspect the repository, preserve existing changes, implement the endpoint, and run the tests.`);
  });

await program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
