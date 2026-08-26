import type { ConversationMessage } from "@contextparcel/protocol";

export interface MessageSelectionOptions {
  mode: "selected" | "recent" | "full" | "generic-selection";
  selectedIds: ReadonlySet<string>;
  recentCount: number;
  includeUser: boolean;
  includeAssistant: boolean;
}

export function messageIdentity(message: ConversationMessage, index: number): string {
  return message.id ?? `message-${index}`;
}

export function normalizeRecentCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(500, Math.max(1, Math.trunc(value)));
}

export function selectConversationMessages(
  messages: readonly ConversationMessage[],
  options: MessageSelectionOptions
): ConversationMessage[] {
  let selected = messages
    .map((message, index) => ({ message, id: messageIdentity(message, index) }))
    .filter(
      ({ message }) =>
        (message.role === "user" && options.includeUser) ||
        (message.role === "assistant" && options.includeAssistant)
    );

  if (options.mode === "selected") {
    selected = selected.filter(({ id }) => options.selectedIds.has(id));
  } else if (options.mode === "recent") {
    selected = selected.slice(-normalizeRecentCount(options.recentCount));
  }

  return selected.map(({ message }) => message);
}
