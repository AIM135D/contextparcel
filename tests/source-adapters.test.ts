import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { ChatGPTAdapter } from "../apps/extension/src/browser/adapters/chatgpt";
import { SourceAdapterError } from "../apps/extension/src/browser/adapters/base";
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

  it("preserves code blocks and assigns unique IDs when ChatGPT repeats DOM identifiers", () => {
    const dom = new JSDOM(
      `<main>
        <article data-testid="duplicate"><div data-message-author-role="user"><div class="whitespace-pre-wrap">中文任务</div></div></article>
        <article data-testid="duplicate"><div data-message-author-role="assistant"><div class="markdown"><p>Use:</p><pre><code>npm test\nnode app.js</code></pre></div></div></article>
      </main>`,
      { url: "https://chatgpt.com/c/test" }
    );
    const messages = new ChatGPTAdapter(dom.window.document).extract().messages;
    expect(messages.map((message) => message.id)).toEqual(["duplicate", "duplicate-2"]);
    expect(messages[1]?.text).toContain("```\nnpm test\nnode app.js\n```");
  });

  it("extracts a long mixed-language conversation in DOM order", () => {
    const turns = Array.from({ length: 120 }, (_, index) => {
      const role = index % 2 === 0 ? "user" : "assistant";
      return `<article data-testid="turn-${index}"><div data-message-author-role="${role}"><div class="markdown">消息 ${index} — hello</div></div></article>`;
    }).join("");
    const dom = new JSDOM(`<main>${turns}</main>`, { url: "https://chatgpt.com/c/long" });
    const messages = new ChatGPTAdapter(dom.window.document).extract().messages;
    expect(messages).toHaveLength(120);
    expect(messages[0]).toMatchObject({ role: "user", text: "消息 0 — hello" });
    expect(messages[119]).toMatchObject({ role: "assistant", text: "消息 119 — hello" });
  });

  it("fails safely when ChatGPT markup has no recognizable messages", () => {
    const dom = new JSDOM("<main><p>Loading…</p></main>", {
      url: "https://chatgpt.com/c/test"
    });
    expect(() => new ChatGPTAdapter(dom.window.document).extract()).toThrow(SourceAdapterError);
  });
});
