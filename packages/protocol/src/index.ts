import { z } from "zod";

export const SCHEMA_VERSION = "1.0" as const;
export const TARGET_AGENTS = ["codex", "claude", "cursor"] as const;

const boundedText = (max: number) => z.string().max(max);

export const MessageSchema = z
  .object({
    id: z.string().min(1).max(256).optional(),
    role: z.enum(["user", "assistant"]),
    text: boundedText(250_000),
    created_at: z.iso.datetime({ offset: true }).optional()
  })
  .strict();

export const SourceSchema = z
  .object({
    type: z.enum(["chatgpt-web", "web-selection", "cli", "sample"]),
    title: z.string().min(1).max(500)
  })
  .strict();

export const GitChangedFileSchema = z
  .object({
    status: z.string().min(1).max(4),
    path: z.string().min(1).max(4096)
  })
  .strict();

export const GitCommitSchema = z
  .object({
    hash: z.string().min(7).max(64),
    subject: z.string().max(1000),
    committed_at: z.iso.datetime({ offset: true })
  })
  .strict();

export const GitContextSchema = z
  .object({
    branch: z.string().max(1000).nullable(),
    commit: z.string().min(7).max(64).nullable(),
    dirty: z.boolean(),
    changed_files: z.array(GitChangedFileSchema).max(10_000),
    diff_stat: z.string().max(50_000).nullable(),
    recent_commits: z.array(GitCommitSchema).max(20)
  })
  .strict();

export const HandoffPacketSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    id: z.uuid(),
    created_at: z.iso.datetime({ offset: true }),
    source: SourceSchema,
    target: z
      .object({
        agent: z.enum(TARGET_AGENTS),
        adapter_version: z.string().min(1).max(100)
      })
      .strict(),
    project: z
      .object({
        id: z.uuid(),
        name: z.string().min(1).max(200),
        root: z.string().min(1).max(4096)
      })
      .strict(),
    conversation: z
      .object({
        selection_mode: z.enum(["selected", "recent", "full", "generic-selection", "cli"]),
        messages: z.array(MessageSchema).min(1).max(10_000)
      })
      .strict(),
    task: z
      .object({
        goal: boundedText(100_000).nullable(),
        constraints: z.array(boundedText(20_000)).max(200),
        acceptance: z.array(boundedText(20_000)).max(200)
      })
      .strict(),
    git: GitContextSchema.nullable()
  })
  .strict();

export const CreateHandoffRequestSchema = z
  .object({
    source: SourceSchema,
    target: z.enum(TARGET_AGENTS),
    project_id: z.uuid(),
    conversation: z
      .object({
        selection_mode: z.enum(["selected", "recent", "full", "generic-selection", "cli"]),
        messages: z.array(MessageSchema).min(1).max(10_000)
      })
      .strict(),
    task: z
      .object({
        goal: boundedText(100_000).nullable().optional(),
        constraints: z.array(boundedText(20_000)).max(200).optional(),
        acceptance: z.array(boundedText(20_000)).max(200).optional()
      })
      .strict()
      .optional(),
    include_git: z.boolean().default(true),
    dry_run: z.boolean().default(false)
  })
  .strict();

export const PreviewHandoffRequestSchema = z
  .object({
    target: z.enum(TARGET_AGENTS),
    project_id: z.uuid(),
    message_counts: z
      .object({
        user: z.number().int().min(0).max(10_000),
        assistant: z.number().int().min(0).max(10_000)
      })
      .strict()
      .refine(({ user, assistant }) => user + assistant > 0, {
        message: "At least one message is required."
      }),
    include_git: z.boolean().default(true),
    include_task: z.boolean().default(true)
  })
  .strict();

export const PairRequestSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    extension_id: z.string().regex(/^[a-z]{32}$/)
  })
  .strict();

export type ConversationMessage = z.infer<typeof MessageSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type GitContext = z.infer<typeof GitContextSchema>;
export type HandoffPacket = z.infer<typeof HandoffPacketSchema>;
export type CreateHandoffRequest = z.infer<typeof CreateHandoffRequestSchema>;
export type PreviewHandoffRequest = z.infer<typeof PreviewHandoffRequestSchema>;
export type TargetAgent = (typeof TARGET_AGENTS)[number];

export function parseHandoffPacket(value: unknown): HandoffPacket {
  return HandoffPacketSchema.parse(value);
}

export function parseCreateHandoffRequest(value: unknown): CreateHandoffRequest {
  return CreateHandoffRequestSchema.parse(value);
}
