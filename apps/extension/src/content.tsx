import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  ConversationMessage,
  CreateHandoffRequest,
  TargetAgent
} from "@contextparcel/protocol";
import { ChatGPTAdapter, GenericSelectionAdapter, SourceAdapterError } from "./browser/adapters";
import type { DaemonRequestMessage, DaemonResponse, OpenHandoffMessage } from "./messages";

const STYLE = `
  :host { all: initial; color-scheme: light dark; }
  * { box-sizing: border-box; }
  .cp-launcher { position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; border: 0; border-radius: 999px; background: #5b5cf0; color: white; font: 600 14px/1 system-ui, sans-serif; padding: 12px 18px; box-shadow: 0 8px 28px rgba(0,0,0,.25); cursor: pointer; }
  .cp-panel { position: fixed; top: 16px; right: 16px; width: min(390px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; z-index: 2147483647; border: 1px solid #d8d8e1; border-radius: 16px; background: #fff; color: #17171c; box-shadow: 0 18px 60px rgba(0,0,0,.28); font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .cp-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #ececf1; }
  .cp-title { font-size: 17px; font-weight: 720; letter-spacing: -.01em; }
  .cp-close { border: 0; background: transparent; color: inherit; font-size: 22px; cursor: pointer; }
  .cp-body { padding: 16px 18px 18px; }
  .cp-section { margin: 0 0 16px; }
  .cp-label { display: block; margin: 0 0 7px; color: #5a5a66; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .cp-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .cp-option { display: flex; gap: 7px; align-items: center; cursor: pointer; }
  .cp-option input { accent-color: #5b5cf0; }
  .cp-input, .cp-select { width: 100%; min-height: 38px; border: 1px solid #cfcfd8; border-radius: 8px; background: #fff; color: #17171c; padding: 8px 10px; font: inherit; }
  .cp-inline-input { width: 72px; }
  .cp-actions { display: flex; gap: 9px; justify-content: flex-end; margin-top: 18px; }
  .cp-button { border: 1px solid #cfcfd8; border-radius: 9px; background: #fff; color: #25252c; padding: 9px 14px; font: 650 14px/1.2 system-ui, sans-serif; cursor: pointer; }
  .cp-primary { border-color: #5b5cf0; background: #5b5cf0; color: white; }
  .cp-button:disabled { opacity: .5; cursor: not-allowed; }
  .cp-help { color: #6a6a75; font-size: 12px; margin: 7px 0 0; }
  .cp-error { padding: 10px 12px; border-radius: 8px; background: #fff0f0; color: #9b1c1c; margin: 0 0 14px; white-space: pre-wrap; }
  .cp-success { padding: 12px; border-radius: 9px; background: #ecfdf3; color: #166534; }
  .cp-preview { border: 1px solid #e0e0e7; border-radius: 10px; background: #f8f8fb; padding: 12px; }
  .cp-preview p { margin: 4px 0; }
  .cp-message-list { max-height: 180px; overflow: auto; border: 1px solid #e0e0e7; border-radius: 8px; padding: 6px; margin-top: 8px; }
  .cp-message { display: grid; grid-template-columns: 20px 64px 1fr; gap: 5px; align-items: start; padding: 6px 4px; border-bottom: 1px solid #ededf2; font-size: 12px; }
  .cp-message:last-child { border-bottom: 0; }
  .cp-role { color: #676773; font-weight: 650; }
  .cp-snippet { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cp-privacy { border-top: 1px solid #ececf1; padding-top: 12px; color: #666672; font-size: 12px; }
  @media (prefers-color-scheme: dark) {
    .cp-panel { background: #202025; color: #f4f4f6; border-color: #3a3a43; }
    .cp-header, .cp-privacy { border-color: #383840; }
    .cp-label, .cp-help { color: #aaaab5; }
    .cp-input, .cp-select, .cp-button { background: #292930; color: #f4f4f6; border-color: #50505a; }
    .cp-preview { background: #292930; border-color: #44444e; }
    .cp-message-list { border-color: #44444e; }
    .cp-message { border-color: #3b3b44; }
    .cp-role { color: #b7b7c0; }
    .cp-error { background: #461d1d; color: #fecaca; }
    .cp-success { background: #153d27; color: #bbf7d0; }
  }
`;

interface ProjectOption {
  id: string;
  name: string;
}

interface PreviewData {
  messages: number;
  user_messages: number;
  assistant_messages: number;
  project: ProjectOption;
  git: { branch: string | null; changed_files: number; dirty: boolean } | null;
  target: TargetAgent;
  target_available: boolean;
  target_version: string | null;
}

interface SourceState {
  title: string;
  type: "chatgpt-web" | "web-selection";
  messages: ConversationMessage[];
}

function errorMessage(response: DaemonResponse): string {
  if (typeof response.data === "object" && response.data !== null && "error" in response.data) {
    const error = (response.data as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return response.status === 0
    ? "Could not reach ContextParcel. Start `contextparcel serve`."
    : "Request failed.";
}

async function daemonRequest(message: Omit<DaemonRequestMessage, "type">): Promise<DaemonResponse> {
  return (await chrome.runtime.sendMessage({
    type: "DAEMON_REQUEST",
    ...message
  })) as DaemonResponse;
}

function ContextParcelPanel({
  onClose,
  selectionText
}: {
  onClose: () => void;
  selectionText: string;
}) {
  const [paired, setPaired] = useState<boolean | null>(null);
  const [port, setPort] = useState(37_421);
  const [pairCode, setPairCode] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [source, setSource] = useState<SourceState | null>(null);
  const [selectionMode, setSelectionMode] = useState<
    "selected" | "recent" | "full" | "generic-selection"
  >("recent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recentCount, setRecentCount] = useState(12);
  const [target, setTarget] = useState<TargetAgent>("codex");
  const [includeGit, setIncludeGit] = useState(true);
  const [includeUser, setIncludeUser] = useState(true);
  const [includeAssistant, setIncludeAssistant] = useState(true);
  const [includeTask, setIncludeTask] = useState(true);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [pendingRequest, setPendingRequest] = useState<CreateHandoffRequest | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");

  const captureSource = useCallback(() => {
    try {
      const genericText = selectionText || window.getSelection()?.toString() || "";
      const adapter = genericText.trim()
        ? new GenericSelectionAdapter(genericText)
        : new ChatGPTAdapter(document);
      const extracted = adapter.extract();
      setSource(extracted);
      setSelectionMode(extracted.type === "web-selection" ? "generic-selection" : "recent");
      setSelectedIds(
        new Set(extracted.messages.map((message, index) => message.id ?? `message-${index}`))
      );
      setError("");
    } catch (captureError) {
      setSource(null);
      setError(
        captureError instanceof SourceAdapterError
          ? captureError.message
          : "Could not capture this page. Select text and use ‘Handoff selection’."
      );
    }
  }, [selectionText]);

  const loadProjects = useCallback(async () => {
    const response = await daemonRequest({ endpoint: "/v1/projects", method: "GET" });
    if (!response.ok) {
      setPaired(false);
      setError(errorMessage(response));
      return;
    }
    const loaded = (response.data as { projects: ProjectOption[] }).projects;
    setProjects(loaded);
    setProjectId((current) => current || loaded[0]?.id || "");
  }, []);

  useEffect(() => {
    captureSource();
    void daemonRequest({ endpoint: "/v1/status", method: "GET" }).then((response) => {
      setPaired(response.ok);
      if (response.ok) void loadProjects();
    });
  }, [captureSource, loadProjects]);

  const filteredMessages = useMemo(() => {
    if (source === null) return [];
    let messages = source.messages.filter(
      (message) =>
        (message.role === "user" && includeUser) ||
        (message.role === "assistant" && includeAssistant)
    );
    if (selectionMode === "selected") {
      messages = messages.filter((message, index) =>
        selectedIds.has(message.id ?? `message-${index}`)
      );
    } else if (selectionMode === "recent") {
      messages = messages.slice(-recentCount);
    }
    return messages;
  }, [includeAssistant, includeUser, recentCount, selectedIds, selectionMode, source]);

  const pair = async (): Promise<void> => {
    setBusy(true);
    setError("");
    const response = await daemonRequest({
      endpoint: "/v1/pair",
      method: "POST",
      body: { code: pairCode },
      port
    });
    setBusy(false);
    if (!response.ok) {
      setError(errorMessage(response));
      return;
    }
    setPaired(true);
    await loadProjects();
  };

  const buildRequest = (): CreateHandoffRequest => {
    if (source === null || filteredMessages.length === 0)
      throw new Error("Choose at least one message.");
    if (!projectId) throw new Error("Initialize a project with `contextparcel init` first.");
    const currentTask =
      [...filteredMessages].reverse().find((message) => message.role === "user")?.text ?? null;
    return {
      source: { type: source.type, title: source.title },
      target,
      project_id: projectId,
      conversation: { selection_mode: selectionMode, messages: filteredMessages },
      task: { goal: includeTask ? currentTask : null, constraints: [], acceptance: [] },
      include_git: includeGit,
      dry_run: false
    };
  };

  const requestPreview = async (): Promise<void> => {
    setError("");
    setSuccess("");
    let request: CreateHandoffRequest;
    try {
      request = buildRequest();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Invalid handoff options.");
      return;
    }
    setBusy(true);
    const response = await daemonRequest({
      endpoint: "/v1/preview",
      method: "POST",
      body: request
    });
    setBusy(false);
    if (!response.ok) {
      setError(errorMessage(response));
      return;
    }
    setPendingRequest(request);
    setPreview(response.data as PreviewData);
  };

  const send = async (): Promise<void> => {
    if (pendingRequest === null) return;
    setBusy(true);
    const response = await daemonRequest({
      endpoint: "/v1/handoffs",
      method: "POST",
      body: pendingRequest
    });
    setBusy(false);
    if (!response.ok) {
      setError(errorMessage(response));
      return;
    }
    const result = response.data as { id: string; target: TargetAgent; handoff_path: string };
    setPreview(null);
    setSuccess(
      `Handoff ${result.id.slice(0, 8)} created for ${result.target}.\n${result.handoff_path}`
    );
  };

  return (
    <div className="cp-panel" role="dialog" aria-label="ContextParcel handoff">
      <div className="cp-header">
        <span className="cp-title">ContextParcel</span>
        <button className="cp-close" type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="cp-body">
        {error ? <div className="cp-error">{error}</div> : null}
        {success ? <div className="cp-success">{success}</div> : null}

        {paired === null ? <p>Connecting to the local daemon…</p> : null}

        {paired === false ? (
          <>
            <div className="cp-section">
              <label className="cp-label" htmlFor="cp-code">
                Pairing code
              </label>
              <input
                id="cp-code"
                className="cp-input"
                inputMode="numeric"
                maxLength={6}
                value={pairCode}
                onChange={(event) => setPairCode(event.target.value.replace(/\D/gu, ""))}
                placeholder="Run: contextparcel pair"
              />
            </div>
            <div className="cp-section">
              <label className="cp-label" htmlFor="cp-port">
                Daemon port
              </label>
              <input
                id="cp-port"
                className="cp-input"
                type="number"
                min={1}
                max={65_535}
                value={port}
                onChange={(event) => setPort(Number(event.target.value))}
              />
            </div>
            <div className="cp-actions">
              <button
                className="cp-button cp-primary"
                type="button"
                disabled={busy || pairCode.length !== 6}
                onClick={pair}
              >
                {busy ? "Pairing…" : "Pair"}
              </button>
            </div>
          </>
        ) : null}

        {paired === true && preview === null ? (
          <>
            <div className="cp-section">
              <span className="cp-label">Send context to</span>
              <div className="cp-row">
                {(["codex", "claude", "cursor"] as const).map((agent) => (
                  <label className="cp-option" key={agent}>
                    <input
                      type="radio"
                      checked={target === agent}
                      onChange={() => setTarget(agent)}
                    />
                    {agent === "claude" ? "Claude Code" : agent === "cursor" ? "Cursor" : "Codex"}
                  </label>
                ))}
              </div>
            </div>

            <div className="cp-section">
              <span className="cp-label">Conversation</span>
              {source?.type === "web-selection" ? (
                <p className="cp-help">
                  Generic selection · {filteredMessages[0]?.text.length ?? 0} characters
                </p>
              ) : (
                <>
                  <div className="cp-row">
                    {(["selected", "recent", "full"] as const).map((mode) => (
                      <label className="cp-option" key={mode}>
                        <input
                          type="radio"
                          checked={selectionMode === mode}
                          onChange={() => setSelectionMode(mode)}
                        />
                        {mode[0]?.toUpperCase() + mode.slice(1)}
                      </label>
                    ))}
                  </div>
                  {selectionMode === "recent" ? (
                    <p className="cp-help">
                      Last{" "}
                      <input
                        className="cp-input cp-inline-input"
                        type="number"
                        min={1}
                        max={500}
                        value={recentCount}
                        onChange={(event) =>
                          setRecentCount(Math.max(1, Number(event.target.value)))
                        }
                      />{" "}
                      messages
                    </p>
                  ) : null}
                  {selectionMode === "selected" && source ? (
                    <div className="cp-message-list">
                      {source.messages.map((message, index) => {
                        const id = message.id ?? `message-${index}`;
                        return (
                          <label className="cp-message" key={id}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(id)}
                              onChange={() =>
                                setSelectedIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(id)) next.delete(id);
                                  else next.add(id);
                                  return next;
                                })
                              }
                            />
                            <span className="cp-role">{message.role}</span>
                            <span className="cp-snippet">{message.text}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="cp-section">
              <label className="cp-label" htmlFor="cp-project">
                Project
              </label>
              <select
                id="cp-project"
                className="cp-select"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {projects.length === 0 ? <option value="">No registered projects</option> : null}
                {projects.map((project) => (
                  <option value={project.id} key={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="cp-section">
              <span className="cp-label">Include</span>
              <div className="cp-row">
                <label className="cp-option">
                  <input
                    type="checkbox"
                    checked={includeGit}
                    onChange={(event) => setIncludeGit(event.target.checked)}
                  />{" "}
                  Git context
                </label>
                <label className="cp-option">
                  <input
                    type="checkbox"
                    checked={includeUser}
                    onChange={(event) => setIncludeUser(event.target.checked)}
                  />{" "}
                  User messages
                </label>
                <label className="cp-option">
                  <input
                    type="checkbox"
                    checked={includeAssistant}
                    onChange={(event) => setIncludeAssistant(event.target.checked)}
                  />{" "}
                  Assistant messages
                </label>
                <label className="cp-option">
                  <input
                    type="checkbox"
                    checked={includeTask}
                    onChange={(event) => setIncludeTask(event.target.checked)}
                  />{" "}
                  Current task
                </label>
              </div>
            </div>
            <div className="cp-actions">
              <button
                className="cp-button cp-primary"
                type="button"
                disabled={busy}
                onClick={requestPreview}
              >
                {busy ? "Preparing…" : "Preview"}
              </button>
            </div>
          </>
        ) : null}

        {paired === true && preview !== null ? (
          <>
            <div className="cp-preview">
              <p>
                <strong>{preview.messages} messages</strong> · {preview.user_messages} user ·{" "}
                {preview.assistant_messages} assistant
              </p>
              <p>Project: {preview.project.name}</p>
              <p>
                Git:{" "}
                {preview.git
                  ? `${preview.git.branch ?? "detached"} · ${preview.git.changed_files} changed files`
                  : "not included"}
              </p>
              <p>Target: {preview.target === "claude" ? "Claude Code" : preview.target}</p>
              {!preview.target_available ? (
                <p className="cp-error">
                  Target CLI is not installed. Install it before sending, or cancel.
                </p>
              ) : null}
            </div>
            <div className="cp-actions">
              <button className="cp-button" type="button" onClick={() => setPreview(null)}>
                Cancel
              </button>
              <button
                className="cp-button cp-primary"
                type="button"
                disabled={busy || !preview.target_available}
                onClick={send}
              >
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        ) : null}

        <p className="cp-privacy">
          Your conversations stay on your machine. Only the messages shown here are handed off.
        </p>
      </div>
    </div>
  );
}

function App() {
  const [open, setOpen] = useState(false);
  const [selectionText, setSelectionText] = useState("");
  const isChatGPT = location.hostname === "chatgpt.com" || location.hostname === "chat.openai.com";

  useEffect(() => {
    const listener = (message: OpenHandoffMessage): void => {
      if (message.type !== "OPEN_HANDOFF") return;
      setSelectionText(message.selectionText);
      setOpen(true);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return (
    <>
      {isChatGPT && !open ? (
        <button
          type="button"
          className="cp-launcher"
          onClick={() => {
            setSelectionText("");
            setOpen(true);
          }}
        >
          Handoff
        </button>
      ) : null}
      {open ? (
        <ContextParcelPanel selectionText={selectionText} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

const host = document.createElement("div");
host.id = "contextparcel-root";
document.documentElement.append(host);
const shadow = host.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = STYLE;
const mount = document.createElement("div");
shadow.append(style, mount);
createRoot(mount).render(<App />);
