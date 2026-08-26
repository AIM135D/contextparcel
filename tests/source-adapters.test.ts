import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { ChatGPTAdapter } from "../apps/extension/src/browser/adapters/chatgpt";
import { GenericSelectionAdapter } from "../apps/extension/src/browser/adapters/generic-selection";

describe("source adapters", () => {
  it("extracts ordered ChatGPT roles without action-button text", () => {
    const dom = new JSDOM(
      `<main>
        <article data-testid="conversation-turn-1"><div data-message-author-role="user"><div class="whitespace-pre-wrap">Build a health route<button>Copy</button></div></div></article>
        <article data-testid="conversation-turn-2"><div data-message-author-role="assistant"><div class="markdown">Use GET /health.</div></div></article>
      </main>`,
      { url: "https://chatgpt.com/c/test" }
    );
    const conversation = new ChatGPTAdapter(dom.window.document).extract();
    expect(conversation.type).toBe("chatgpt-web");
    expect(conversation.messages).toEqual([
      { id: "conversation-turn-1", role: "user", text: "Build a health route" },
      { id: "conversation-turn-2", role: "assistant", text: "Use GET /health." }
    ]);
  });

  it("keeps only the user-selected text in generic fallback", () => {
    const dom = new JSDOM("<title>Docs</title>", { url: "https://example.com" });
    const conversation = new GenericSelectionAdapter(
      "  selected paragraph  ",
      dom.window.document
    ).extract();
    expect(conversation.messages).toEqual([
      { id: "web-selection-1", role: "user", text: "selected paragraph" }
    ]);
  });
});
