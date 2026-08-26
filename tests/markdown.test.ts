import { describe, expect, it } from "vitest";
import { generateHandoffMarkdown } from "@contextparcel/core";
import { packetFixture } from "./fixtures";

describe("human-readable handoff", () => {
  it("renders all required sections and repository details", () => {
    const markdown = generateHandoffMarkdown(packetFixture());
    for (const heading of [
      "# Mission",
      "# Conversation Context",
      "# Decisions / Constraints",
      "# Repository State",
      "# Changed Files",
      "# Recent Commits",
      "# Pickup Instructions"
    ]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain("Add GET /health.");
    expect(markdown).toContain("feature/health");
    expect(markdown).toContain("src/server.ts");
  });
});
