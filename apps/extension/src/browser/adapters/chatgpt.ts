import type { ConversationMessage } from "@contextparcel/protocol";
import { SourceAdapterError, type SourceAdapter, type SourceConversation } from "./base";

const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);

function cleanText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("button, svg, nav, [aria-hidden='true']").forEach((node) => node.remove());
  return (clone.textContent ?? "")
    .replace(/\u00a0/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export class ChatGPTAdapter implements SourceAdapter {
  readonly id = "chatgpt-web";

  constructor(private readonly document: Document = window.document) {}

  canHandle(): boolean {
    return CHATGPT_HOSTS.has(this.document.location.hostname);
  }

  extract(): SourceConversation {
    if (!this.canHandle())
      throw new SourceAdapterError("This page is not a supported ChatGPT conversation.");

    const roleNodes = [
      ...this.document.querySelectorAll<HTMLElement>(
        'main [data-message-author-role="user"], main [data-message-author-role="assistant"]'
      )
    ];
    const seen = new Set<Element>();
    const messages: ConversationMessage[] = [];

    for (const node of roleNodes) {
      const container = node.closest("article") ?? node;
      if (seen.has(container)) continue;
      seen.add(container);
      const roleValue = node.dataset.messageAuthorRole;
      if (roleValue !== "user" && roleValue !== "assistant") continue;
      const preferred =
        container.querySelector(
          "[data-message-content], .markdown, [class*='whitespace-pre-wrap']"
        ) ?? node;
      const text = cleanText(preferred);
      if (text.length === 0) continue;
      messages.push({
        id:
          node.dataset.messageId ??
          container.getAttribute("data-testid") ??
          `chatgpt-${messages.length + 1}`,
        role: roleValue,
        text
      });
    }

    if (messages.length === 0) {
      throw new SourceAdapterError(
        "ChatGPT messages could not be read. Select text on the page and use ‘Handoff selection’ instead."
      );
    }

    return {
      title:
        this.document.title.replace(/\s*[-–|]\s*ChatGPT\s*$/u, "").trim() || "ChatGPT conversation",
      type: "chatgpt-web",
      messages
    };
  }
}
