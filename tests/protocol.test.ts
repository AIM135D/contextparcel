import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  CreateHandoffRequestSchema,
  HandoffPacketSchema,
  PreviewHandoffRequestSchema
} from "@contextparcel/protocol";
import { packetFixture, requestFixture } from "./fixtures";

describe("Handoff Packet v1", () => {
  it("accepts a complete v1 packet", () => {
    expect(HandoffPacketSchema.parse(packetFixture()).schema_version).toBe("1.0");
  });

  it("rejects unsupported protocol versions", () => {
    expect(() =>
      HandoffPacketSchema.parse({ ...packetFixture(), schema_version: "2.0" })
    ).toThrow();
  });

  it("rejects unknown fields and browser-supplied paths", () => {
    const request = { ...requestFixture(crypto.randomUUID()), project_root: "../../private" };
    expect(() => CreateHandoffRequestSchema.parse(request)).toThrow();
  });

  it("rejects malformed roles and empty conversations", () => {
    const request = requestFixture(crypto.randomUUID());
    expect(() =>
      CreateHandoffRequestSchema.parse({
        ...request,
        conversation: { selection_mode: "full", messages: [] }
      })
    ).toThrow();
    expect(() =>
      CreateHandoffRequestSchema.parse({
        ...request,
        conversation: { selection_mode: "full", messages: [{ role: "developer", text: "x" }] }
      })
    ).toThrow();
  });

  it("keeps preview payloads metadata-only", () => {
    const projectId = crypto.randomUUID();
    expect(
      PreviewHandoffRequestSchema.parse({
        target: "codex",
        project_id: projectId,
        message_counts: { user: 2, assistant: 1 },
        include_git: true,
        include_task: true
      })
    ).toMatchObject({ project_id: projectId, message_counts: { user: 2, assistant: 1 } });
    expect(() =>
      PreviewHandoffRequestSchema.parse({
        target: "codex",
        project_id: projectId,
        message_counts: { user: 0, assistant: 0 },
        conversation: { messages: [{ role: "user", text: "private" }] }
      })
    ).toThrow();
  });

  it("keeps the published JSON Schema valid for the sample packet", async () => {
    const schema = JSON.parse(
      await readFile(new URL("../docs/handoff-packet.schema.json", import.meta.url), "utf8")
    ) as object;
    const sample = JSON.parse(
      await readFile(new URL("../examples/sample-handoff/handoff.json", import.meta.url), "utf8")
    ) as unknown;
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    expect(ajv.validate(schema, sample), JSON.stringify(ajv.errors)).toBe(true);
    expect(HandoffPacketSchema.safeParse(sample).success).toBe(true);
  });
});
