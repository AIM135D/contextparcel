import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ZodError } from "zod";
import { CreateHandoffRequestSchema, PairRequestSchema } from "@contextparcel/protocol";
import { AdapterNotInstalledError } from "@contextparcel/targets";
import {
  APP_NAME,
  APP_VERSION,
  DEFAULT_HOST,
  DEFAULT_PORT,
  MAX_REQUEST_BYTES
} from "./constants.js";
import { ContextParcelError, OriginError } from "./errors.js";
import { HandoffService, type TargetFactory } from "./handoffs.js";
import { StructuredLogger, type Logger } from "./logger.js";
import {
  consumePairingCode,
  isPairedOrigin,
  validateExtensionOrigin,
  verifyPairingToken
} from "./pairing.js";
import { listProjects } from "./projects.js";
import { StateStore } from "./storage.js";

const ALLOWED_HEADERS = "authorization, content-type, x-contextparcel-version";

export interface DaemonOptions {
  host?: string;
  port?: number;
  store?: StateStore;
  logger?: Logger;
  targetFactory?: TargetFactory;
}

export interface RunningDaemon {
  server: Server;
  host: string;
  port: number;
  close(): Promise<void>;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
}

function respondJson(res: ServerResponse, status: number, value: unknown, origin?: string): void {
  setSecurityHeaders(res);
  if (origin !== undefined) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(value)}\n`);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new ContextParcelError("Request body exceeds 2 MiB.", "PAYLOAD_TOO_LARGE", 413);
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ContextParcelError("Request body must be valid JSON.", "INVALID_JSON", 400);
  }
}

async function authorizeOrigin(store: StateStore, req: IncomingMessage): Promise<string> {
  const origin = header(req, "origin");
  if (origin === undefined || !(await isPairedOrigin(store, origin))) throw new OriginError();
  await verifyPairingToken(store, origin, header(req, "authorization"));
  return origin;
}

async function authorizePreflight(store: StateStore, req: IncomingMessage): Promise<string> {
  const origin = header(req, "origin");
  if (origin === undefined) throw new OriginError();
  if (req.url === "/v1/pair") {
    validateExtensionOrigin(origin);
    return origin;
  }
  if (!(await isPairedOrigin(store, origin))) throw new OriginError();
  return origin;
}

function handleError(
  res: ServerResponse,
  error: unknown,
  origin: string | undefined,
  logger: Logger
): void {
  if (error instanceof ZodError) {
    respondJson(
      res,
      400,
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Request did not match the API schema.",
          issues: error.issues
        }
      },
      origin
    );
    return;
  }
  if (error instanceof AdapterNotInstalledError) {
    respondJson(
      res,
      422,
      { error: { code: "TARGET_NOT_INSTALLED", message: error.message } },
      origin
    );
    return;
  }
  if (error instanceof ContextParcelError) {
    respondJson(
      res,
      error.statusCode,
      { error: { code: error.code, message: error.message } },
      origin
    );
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  logger.error("request_failed", { error: message });
  respondJson(
    res,
    500,
    { error: { code: "INTERNAL_ERROR", message: "Internal daemon error." } },
    origin
  );
}

export function createDaemonServer(options: DaemonOptions = {}): Server {
  const store = options.store ?? new StateStore();
  const logger = options.logger ?? new StructuredLogger();
  const handoffs = new HandoffService(store, options.targetFactory);

  const server = createServer((req, res) => {
    void (async () => {
      let responseOrigin: string | undefined;
      try {
        if (req.method === "GET" && req.url === "/v1/health") {
          respondJson(res, 200, { name: APP_NAME, version: APP_VERSION, status: "ok" });
          return;
        }

        if (req.method === "OPTIONS") {
          responseOrigin = await authorizePreflight(store, req);
          setSecurityHeaders(res);
          res.setHeader("Access-Control-Allow-Origin", responseOrigin);
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
          res.setHeader("Access-Control-Max-Age", "600");
          res.setHeader("Vary", "Origin");
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method === "POST" && req.url === "/v1/pair") {
          const origin = header(req, "origin");
          if (origin === undefined) throw new OriginError();
          responseOrigin = origin;
          const body = PairRequestSchema.parse(await readJsonBody(req));
          const token = await consumePairingCode(store, body.code, origin, body.extension_id);
          logger.info("extension_paired", { extension_id: body.extension_id });
          respondJson(res, 200, { token, paired: true }, origin);
          return;
        }

        responseOrigin = await authorizeOrigin(store, req);

        if (req.method === "GET" && req.url === "/v1/status") {
          const [state, projects] = await Promise.all([store.readState(), listProjects(store)]);
          respondJson(
            res,
            200,
            {
              name: APP_NAME,
              version: APP_VERSION,
              paired: true,
              projects: projects.length,
              port: state.port
            },
            responseOrigin
          );
          return;
        }

        if (req.method === "GET" && req.url === "/v1/projects") {
          const projects = (await listProjects(store)).map(({ id, name }) => ({ id, name }));
          respondJson(res, 200, { projects }, responseOrigin);
          return;
        }

        if (req.method === "POST" && req.url === "/v1/preview") {
          const request = CreateHandoffRequestSchema.parse(await readJsonBody(req));
          respondJson(res, 200, await handoffs.preview(request), responseOrigin);
          return;
        }

        if (req.method === "POST" && req.url === "/v1/handoffs") {
          const request = CreateHandoffRequestSchema.parse(await readJsonBody(req));
          const created = await handoffs.create(request);
          logger.info("handoff_created", {
            id: created.packet.id,
            target: created.packet.target.agent,
            project_id: created.packet.project.id,
            launched: created.launched
          });
          respondJson(
            res,
            201,
            {
              id: created.packet.id,
              created_at: created.packet.created_at,
              target: created.packet.target.agent,
              launched: created.launched,
              handoff_path: created.markdownPath
            },
            responseOrigin
          );
          return;
        }

        respondJson(
          res,
          404,
          { error: { code: "NOT_FOUND", message: "Route not found." } },
          responseOrigin
        );
      } catch (error) {
        handleError(res, error, responseOrigin, logger);
      }
    })();
  });

  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

export async function startDaemon(options: DaemonOptions = {}): Promise<RunningDaemon> {
  const host = options.host ?? DEFAULT_HOST;
  if (host !== DEFAULT_HOST) {
    throw new ContextParcelError(
      "ContextParcel only binds to 127.0.0.1.",
      "UNSAFE_BIND_ADDRESS",
      400
    );
  }
  const requestedPort = options.port ?? DEFAULT_PORT;
  const server = createDaemonServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Daemon did not receive a TCP address.");
  }
  const tcpAddress: AddressInfo = address;
  return {
    server,
    host,
    port: tcpAddress.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      })
  };
}
