import { SourceAdapterError, type SourceAdapter, type SourceConversation } from "./base";

export class GenericSelectionAdapter implements SourceAdapter {
  readonly id = "generic-selection";

  constructor(
    private readonly selectedText: string = window.getSelection()?.toString() ?? "",
    private readonly document: Document = window.document
  ) {}

  canHandle(): boolean {
    return this.selectedText.trim().length > 0;
  }

  extract(): SourceConversation {
    const text = this.selectedText.trim();
    if (text.length === 0)
      throw new SourceAdapterError("Select text on the page before creating a handoff.");
    return {
      title: this.document.title || this.document.location.hostname || "Web selection",
      type: "web-selection",
      messages: [{ id: "web-selection-1", role: "user", text }]
    };
  }
}
