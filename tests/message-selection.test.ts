import { describe, expect, it } from "vitest";
import {
  normalizeRecentCount,
  selectConversationMessages
} from "../apps/extension/src/browser/select-messages";

const messages = [
  { id: "u1", role: "user" as const, text: "first" },
  { id: "a1", role: "assistant" as const, text: "second" },
  { id: "u2", role: "user" as const, text: "third" },
  { id: "a2", role: "assistant" as const, text: "fourth" }
];

describe("conversation range selection", () => {
  it("sends only explicitly selected messages", () => {
    expect(
      selectConversationMessages(messages, {
        mode: "selected",
        selectedIds: new Set(["a1", "u2"]),
        recentCount: 10,
        includeUser: true,
        includeAssistant: true
      }).map((message) => message.id)
    ).toEqual(["a1", "u2"]);
  });

  it("applies role authorization before recent-message slicing", () => {
    expect(
      selectConversationMessages(messages, {
        mode: "recent",
        selectedIds: new Set(),
        recentCount: 1,
        includeUser: true,
        includeAssistant: false
      })
    ).toEqual([{ id: "u2", role: "user", text: "third" }]);
  });

  it("clamps invalid recent counts to the supported range", () => {
    expect(normalizeRecentCount(Number.NaN)).toBe(1);
    expect(normalizeRecentCount(-4)).toBe(1);
    expect(normalizeRecentCount(12.9)).toBe(12);
    expect(normalizeRecentCount(999)).toBe(500);
  });
});
