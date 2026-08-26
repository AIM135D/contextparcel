import type {
  DaemonEndpoint,
  DaemonRequestMessage,
  DaemonResponse,
  OpenHandoffMessage
} from "./messages";

const ENDPOINTS = new Set<DaemonEndpoint>([
  "/v1/pair",
  "/v1/status",
  "/v1/projects",
  "/v1/preview",
  "/v1/handoffs"
]);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "contextparcel-handoff-selection",
    title: "Handoff selection",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "contextparcel-handoff-selection" || tab?.id === undefined) return;
  const message: OpenHandoffMessage = {
    type: "OPEN_HANDOFF",
    selectionText: info.selectionText ?? ""
  };
  void chrome.tabs.sendMessage(tab.id, message);
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  const message: OpenHandoffMessage = { type: "OPEN_HANDOFF", selectionText: "" };
  void chrome.tabs.sendMessage(tab.id, message);
});

chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  if (!isDaemonRequest(raw)) return false;
  void requestDaemon(raw).then(sendResponse);
  return true;
});

function isDaemonRequest(value: unknown): value is DaemonRequestMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DaemonRequestMessage>;
  return (
    candidate.type === "DAEMON_REQUEST" &&
    (candidate.method === "GET" || candidate.method === "POST") &&
    typeof candidate.endpoint === "string" &&
    ENDPOINTS.has(candidate.endpoint)
  );
}

async function requestDaemon(message: DaemonRequestMessage): Promise<DaemonResponse> {
  try {
    const stored = await chrome.storage.local.get(["pairingToken", "daemonPort"]);
    const configuredPort = message.port ?? Number(stored.daemonPort ?? 37_421);
    if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65_535) {
      return { ok: false, status: 0, data: { error: { message: "Invalid daemon port." } } };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-ContextParcel-Version": "0.1.0"
    };
    if (message.endpoint !== "/v1/pair" && typeof stored.pairingToken === "string") {
      headers.Authorization = `Bearer ${stored.pairingToken}`;
    }
    const body =
      message.endpoint === "/v1/pair" && typeof message.body === "object" && message.body !== null
        ? { ...message.body, extension_id: chrome.runtime.id }
        : message.body;

    const requestInit: RequestInit = {
      method: message.method,
      headers
    };
    if (message.method === "POST") requestInit.body = JSON.stringify(body ?? {});
    const response = await fetch(
      `http://127.0.0.1:${configuredPort}${message.endpoint}`,
      requestInit
    );
    const data = (await response.json()) as unknown;
    if (response.ok && message.endpoint === "/v1/pair") {
      const token = (data as { token?: unknown }).token;
      if (typeof token === "string") {
        await chrome.storage.local.set({ pairingToken: token, daemonPort: configuredPort });
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {
        error: { message: error instanceof Error ? error.message : "Could not reach local daemon." }
      }
    };
  }
}
