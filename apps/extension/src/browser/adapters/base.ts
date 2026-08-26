import type { ConversationMessage } from "@contextparcel/protocol";

export interface SourceConversation {
  title: string;
  type: "chatgpt-web" | "web-selection";
  messages: ConversationMessage[];
}

export interface SourceAdapter {
  readonly id: string;
  canHandle(): boolean;
  extract(): SourceConversation;
}

export class SourceAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceAdapterError";
  }
}
