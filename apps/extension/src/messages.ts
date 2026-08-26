export type DaemonEndpoint =
  "/v1/pair" | "/v1/status" | "/v1/projects" | "/v1/preview" | "/v1/handoffs";

export interface DaemonRequestMessage {
  type: "DAEMON_REQUEST";
  endpoint: DaemonEndpoint;
  method: "GET" | "POST";
  body?: unknown;
  port?: number;
}

export interface OpenHandoffMessage {
  type: "OPEN_HANDOFF";
  selectionText: string;
}

export interface DaemonResponse {
  ok: boolean;
  status: number;
  data: unknown;
}
