import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HeartbeatMessageSchema,
  HostHelloMessageSchema,
  InputMessageSchema,
  MobileHelloMessageSchema,
  parseHubMessage,
  safeParseHostStatePayload,
  type ErrorMessage,
  type GameStateMessage,
  type HelloAckMessage,
  type InputMessage,
  type PlayerJoinedMessage,
  type PlayerLeftMessage,
  type PlayerRole,
  type SessionPhase,
  type SessionTerminatedMessage,
} from "@game-hub/protocol";
import { z } from "zod";
import { WebSocket, WebSocketServer, type RawData } from "ws";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8787;
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 1000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10 * 1000;
const DEFAULT_MAX_MESSAGE_BYTES = 4 * 1024;
const DEFAULT_MAX_BODY_BYTES = 1024;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 1000;
const DEFAULT_RATE_LIMIT_MAX_MESSAGES = 60;
const DEFAULT_HOST_RATE_LIMIT_WINDOW_MS = 10 * 1000;
const DEFAULT_HOST_RATE_LIMIT_MAX_MESSAGES = 600;
const DEFAULT_INPUT_RATE_LIMIT_WINDOW_MS = 1000;
const DEFAULT_INPUT_RATE_LIMIT_MAX_MESSAGES = 30;
const DEFAULT_CREATE_SESSION_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_CREATE_SESSION_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_HANDSHAKE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_HANDSHAKE_RATE_LIMIT_MAX_ATTEMPTS = 120;
const DEFAULT_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_AUTH_FAILURE_RATE_LIMIT_MAX_ATTEMPTS = 20;
const DEFAULT_INPUT_ORDER_VIOLATION_NOTIFY_INTERVAL_MS = 1000;
const MAX_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_CLOSE_CODE = 4001;
const RATE_LIMIT_CLOSE_CODE = 4008;
const PROTOCOL_CLOSE_CODE = 4400;
const AUTH_CLOSE_CODE = 4401;
const NOT_FOUND_CLOSE_CODE = 4404;
const CONFLICT_CLOSE_CODE = 4409;

const CreateSessionRequestSchema = z
  .object({
    ttlMs: z.number().int().positive().max(MAX_SESSION_TTL_MS).optional(),
  })
  .strict();

type RelaySocketKind = "host" | "mobile";

interface RateLimitState {
  lastViolationAt: number | null;
  messageCount: number;
  windowStartedAt: number;
}

interface RelayConnection {
  inputRateLimit: RateLimitState;
  kind: RelaySocketKind;
  lastInputOrderViolationAt: number | null;
  lastSeen: number;
  lastClientSequence: number;
  playerId?: string;
  rateLimit: RateLimitState;
  sequenceBase: number;
  sessionId: string;
  ws: WebSocket;
}

interface SessionPlayer {
  lastAcceptedSequence: number;
  lastSeen: number;
  name: string;
  playerId: string;
  playerToken: string;
  socket: WebSocket | null;
}

interface SessionRecord {
  createdAt: number;
  expiresAt: number;
  hostConnection: RelayConnection | null;
  hostEverConnected: boolean;
  hostSecret: string;
  lastSeen: number;
  latestGameState: GameStateMessage | null;
  players: Map<string, SessionPlayer>;
  sessionId: string;
}

export interface CreateSessionResponse {
  expiresAt: number;
  hostSecret: string;
  joinUrl: string;
  sessionId: string;
  ttlMs: number;
}

export interface RelayServerOptions {
  allowedWebOrigins?: string[];
  authFailureRateLimitMaxAttempts?: number;
  authFailureRateLimitWindowMs?: number;
  cleanupIntervalMs?: number;
  createSessionRateLimitMaxRequests?: number;
  createSessionRateLimitWindowMs?: number;
  handshakeRateLimitMaxAttempts?: number;
  handshakeRateLimitWindowMs?: number;
  handshakeTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  host?: string;
  hostRateLimitMaxMessages?: number;
  hostRateLimitWindowMs?: number;
  inputRateLimitMaxMessages?: number;
  inputRateLimitWindowMs?: number;
  maxBodyBytes?: number;
  maxMessageBytes?: number;
  mobileDistDir?: string;
  now?: () => number;
  port?: number;
  publicBaseUrl?: string;
  rateLimitMaxMessages?: number;
  rateLimitWindowMs?: number;
  sessionTtlMs?: number;
}

interface NormalizedRelayServerOptions {
  allowedWebOrigins: string[];
  authFailureRateLimitMaxAttempts: number;
  authFailureRateLimitWindowMs: number;
  cleanupIntervalMs: number;
  createSessionRateLimitMaxRequests: number;
  createSessionRateLimitWindowMs: number;
  handshakeRateLimitMaxAttempts: number;
  handshakeRateLimitWindowMs: number;
  handshakeTimeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  host: string;
  hostRateLimitMaxMessages: number;
  hostRateLimitWindowMs: number;
  inputRateLimitMaxMessages: number;
  inputRateLimitWindowMs: number;
  maxBodyBytes: number;
  maxMessageBytes: number;
  mobileDistDir: string;
  now: () => number;
  port: number;
  publicBaseUrl: string | null;
  rateLimitMaxMessages: number;
  rateLimitWindowMs: number;
  sessionTtlMs: number;
}

export interface RelayListenResult {
  host: string;
  port: number;
}

class RequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

function describeHttpError(code: string): string {
  switch (code) {
    case "payload_too_large":
      return "Request payload is larger than the allowed limit.";
    case "rate_limited":
      return "Too many requests. Try again later.";
    default:
      return code.replaceAll("_", " ");
  }
}

function defaultMobileDistDir(): string {
  return resolve(fileURLToPath(new URL("../../mobile/dist/", import.meta.url)));
}

function rawDataToBuffer(data: RawData): Buffer {
  if (typeof data === "string") {
    return Buffer.from(data, "utf8");
  }

  if (data instanceof Buffer) {
    return data;
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(data));
  }

  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function contentTypeForPath(pathname: string): string {
  switch (extname(pathname).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function closeReason(reason: string): Buffer {
  return Buffer.from(reason.slice(0, 120), "utf8");
}

function createRateLimitState(now: number): RateLimitState {
  return {
    lastViolationAt: null,
    messageCount: 0,
    windowStartedAt: now,
  };
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed === "") {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function normalizePublicBaseUrl(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return null;
  }

  const url = new URL(trimmed);
  url.hash = "";
  return url.toString();
}

function normalizeAllowedWebOrigins(values: string[] | undefined): string[] {
  if (values === undefined) {
    return [];
  }

  const origins = new Set<string>();

  for (const value of values) {
    const normalized = normalizeOrigin(value);

    if (normalized !== null) {
      origins.add(normalized);
    }
  }

  return [...origins];
}

function normalizeIpAddress(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    return "unknown";
  }

  if (value.startsWith("::ffff:")) {
    return value.slice("::ffff:".length);
  }

  return value;
}

function buildJoinUrlFromBaseUrl(baseUrl: string, sessionId: string): string {
  const url = new URL(baseUrl);
  url.hash = "";
  url.search = "";
  url.searchParams.set("sessionId", sessionId);
  return url.toString();
}

function createCommonSecurityHeaders(): Record<string, string> {
  return {
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function createStaticSecurityHeaders(contentType: string): Record<string, string> {
  return {
    ...createCommonSecurityHeaders(),
    "content-security-policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
    "content-type": contentType,
  };
}

function rejectUpgradeRequest(
  socket: Duplex,
  statusCode: number,
  message: string,
): void {
  if (socket.destroyed) {
    return;
  }

  const body = Buffer.from(message, "utf8");
  const statusText =
    statusCode === 403
      ? "Forbidden"
      : statusCode === 429
        ? "Too Many Requests"
        : "Bad Request";
  socket.write(
    [
      `HTTP/1.1 ${statusCode} ${statusText}`,
      "Connection: close",
      "Content-Type: text/plain; charset=utf-8",
      `Content-Length: ${body.byteLength}`,
      "",
      message,
    ].join("\r\n"),
  );
  socket.destroy();
}

export class RelayServer {
  private readonly authFailureRateLimits = new Map<string, RateLimitState>();
  private readonly createSessionRateLimits = new Map<string, RateLimitState>();
  private readonly hostWss = new WebSocketServer({ noServer: true });
  private readonly mobileWss = new WebSocketServer({ noServer: true });
  private readonly options: NormalizedRelayServerOptions;
  private readonly server = createServer((request, response) => {
    void this.handleHttpRequest(request, response);
  });
  private readonly websocketHandshakeRateLimits = new Map<string, RateLimitState>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(options: RelayServerOptions = {}) {
    this.options = {
      allowedWebOrigins: normalizeAllowedWebOrigins(options.allowedWebOrigins),
      authFailureRateLimitMaxAttempts:
        options.authFailureRateLimitMaxAttempts ??
        DEFAULT_AUTH_FAILURE_RATE_LIMIT_MAX_ATTEMPTS,
      authFailureRateLimitWindowMs:
        options.authFailureRateLimitWindowMs ??
        DEFAULT_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS,
      cleanupIntervalMs:
        options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS,
      createSessionRateLimitMaxRequests:
        options.createSessionRateLimitMaxRequests ??
        DEFAULT_CREATE_SESSION_RATE_LIMIT_MAX_REQUESTS,
      createSessionRateLimitWindowMs:
        options.createSessionRateLimitWindowMs ??
        DEFAULT_CREATE_SESSION_RATE_LIMIT_WINDOW_MS,
      handshakeRateLimitMaxAttempts:
        options.handshakeRateLimitMaxAttempts ??
        DEFAULT_HANDSHAKE_RATE_LIMIT_MAX_ATTEMPTS,
      handshakeRateLimitWindowMs:
        options.handshakeRateLimitWindowMs ??
        DEFAULT_HANDSHAKE_RATE_LIMIT_WINDOW_MS,
      handshakeTimeoutMs:
        options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
      heartbeatIntervalMs:
        options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs:
        options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS,
      host: options.host ?? DEFAULT_HOST,
      hostRateLimitMaxMessages:
        options.hostRateLimitMaxMessages ?? DEFAULT_HOST_RATE_LIMIT_MAX_MESSAGES,
      hostRateLimitWindowMs:
        options.hostRateLimitWindowMs ?? DEFAULT_HOST_RATE_LIMIT_WINDOW_MS,
      inputRateLimitMaxMessages:
        options.inputRateLimitMaxMessages ?? DEFAULT_INPUT_RATE_LIMIT_MAX_MESSAGES,
      inputRateLimitWindowMs:
        options.inputRateLimitWindowMs ?? DEFAULT_INPUT_RATE_LIMIT_WINDOW_MS,
      maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
      maxMessageBytes: options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
      mobileDistDir: options.mobileDistDir ?? defaultMobileDistDir(),
      now: options.now ?? (() => Date.now()),
      port: options.port ?? DEFAULT_PORT,
      publicBaseUrl: normalizePublicBaseUrl(options.publicBaseUrl),
      rateLimitMaxMessages:
        options.rateLimitMaxMessages ?? DEFAULT_RATE_LIMIT_MAX_MESSAGES,
      rateLimitWindowMs:
        options.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
      sessionTtlMs: options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS,
    };

    this.hostWss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
      this.attachHostSocket(ws, request);
    });

    this.mobileWss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
      this.attachMobileSocket(ws, request);
    });

    this.server.on("upgrade", (request, socket, head) => {
      const pathname = this.getRequestPathname(request);
      const now = this.options.now();
      const clientIp = this.getClientIp(request);

      if (!this.allowIpRateLimit(
        this.websocketHandshakeRateLimits,
        clientIp,
        now,
        this.options.handshakeRateLimitWindowMs,
        this.options.handshakeRateLimitMaxAttempts,
      )) {
        this.log("websocket_handshake_rate_limited", {
          ip: clientIp,
          pathname,
        });
        rejectUpgradeRequest(socket, 429, "Too many websocket handshakes.");
        return;
      }

      if (pathname === "/ws/host") {
        this.hostWss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.hostWss.emit("connection", ws, request);
        });
        return;
      }

      if (pathname === "/ws/mobile") {
        if (!this.isAllowedMobileOrigin(request)) {
          this.log("mobile_origin_rejected", {
            ip: clientIp,
            origin: Array.isArray(request.headers.origin) ? request.headers.origin.join(",") : request.headers.origin ?? "missing",
          });
          rejectUpgradeRequest(socket, 403, "WebSocket origin is not allowed.");
          return;
        }

        this.mobileWss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.mobileWss.emit("connection", ws, request);
        });
        return;
      }

      socket.destroy();
    });
  }

  async listen(): Promise<RelayListenResult> {
    if (this.cleanupTimer === null) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupSessions();
      }, this.options.cleanupIntervalMs);
      this.cleanupTimer.unref();
    }

    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };

      const onListening = () => {
        this.server.off("error", onError);
        const address = this.server.address();

        if (address === null || typeof address === "string") {
          resolve({
            host: this.options.host,
            port: this.options.port,
          });
          return;
        }

        resolve({
          host: this.options.host,
          port: address.port,
        });
      };

      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.options.port, this.options.host);
    });
  }

  async close(): Promise<void> {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const session of [...this.sessions.values()]) {
      this.terminateSession(session, "relay_shutdown");
    }

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private allowRateLimit(
    rateLimit: RateLimitState,
    now: number,
    windowMs: number,
    maxMessages: number,
  ): boolean {
    if (now - rateLimit.windowStartedAt >= windowMs) {
      rateLimit.windowStartedAt = now;
      rateLimit.messageCount = 0;
    }

    rateLimit.messageCount += 1;
    return rateLimit.messageCount <= maxMessages;
  }

  private allowIpRateLimit(
    states: Map<string, RateLimitState>,
    ip: string,
    now: number,
    windowMs: number,
    maxMessages: number,
  ): boolean {
    const state = states.get(ip) ?? createRateLimitState(now);
    const allowed = this.allowRateLimit(state, now, windowMs, maxMessages);
    states.set(ip, state);
    return allowed;
  }

  private attachHostSocket(ws: WebSocket, request: IncomingMessage): void {
    const handshakeStartedAt = this.options.now();
    const clientIp = this.getClientIp(request);
    const rateLimit = createRateLimitState(handshakeStartedAt);
    const inputRateLimit = createRateLimitState(handshakeStartedAt);

    let connection: RelayConnection | null = null;
    let session: SessionRecord | null = null;

    const handshakeTimer = setTimeout(() => {
      this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "handshake_timeout", "Handshake timeout.");
    }, this.options.handshakeTimeoutMs);

    ws.on("message", (data: RawData) => {
      const now = this.options.now();

      if (this.isAuthFailureRateLimited(clientIp, now)) {
        this.rejectSocket(
          ws,
          RATE_LIMIT_CLOSE_CODE,
          "rate_limited",
          "Too many authentication failures. Try again later.",
        );
        return;
      }

      if (
        !this.allowRateLimit(
          rateLimit,
          now,
          this.options.hostRateLimitWindowMs,
          this.options.hostRateLimitMaxMessages,
        )
      ) {
        this.log("host_rate_limited", {
          sessionId: session?.sessionId ?? "unknown",
        });
        this.rejectSocket(ws, RATE_LIMIT_CLOSE_CODE, "rate_limited", "Rate limit exceeded.");
        return;
      }

      if (connection === null) {
        const payload = this.parseSocketPayload(ws, data);

        if (payload === null) {
          return;
        }

        const helloResult = HostHelloMessageSchema.safeParse(payload);

        if (!helloResult.success) {
          this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "invalid_host_hello", "Invalid host hello payload.");
          return;
        }

        const hello = helloResult.data;
        const nextSession = this.sessions.get(hello.sessionId) ?? null;

        if (nextSession === null) {
          this.recordAuthFailure(clientIp, now, "session_not_found");
          this.rejectSocket(ws, NOT_FOUND_CLOSE_CODE, "session_not_found", "Session not found.");
          return;
        }

        if (this.isSessionExpired(nextSession, now)) {
          this.recordAuthFailure(clientIp, now, "session_expired");
          this.terminateSession(nextSession, "session_expired");
          this.rejectSocket(ws, NOT_FOUND_CLOSE_CODE, "session_expired", "Session expired.");
          return;
        }

        if (nextSession.hostSecret !== hello.token) {
          this.recordAuthFailure(clientIp, now, "invalid_host_secret");
          this.rejectSocket(ws, AUTH_CLOSE_CODE, "invalid_host_secret", "Invalid host secret.");
          return;
        }

        if (
          nextSession.hostConnection !== null &&
          nextSession.hostConnection.ws.readyState === WebSocket.OPEN
        ) {
          this.rejectSocket(ws, CONFLICT_CLOSE_CODE, "host_already_connected", "Host is already connected.");
          return;
        }

        session = nextSession;
        connection = {
          inputRateLimit,
          kind: "host",
          lastInputOrderViolationAt: null,
          lastSeen: now,
          lastClientSequence: 0,
          rateLimit,
          sequenceBase: 0,
          sessionId: session.sessionId,
          ws,
        };
        session.hostConnection = connection;
        session.hostEverConnected = true;
        session.lastSeen = now;
        clearTimeout(handshakeTimer);

        this.log("host_connected", {
          sessionId: session.sessionId,
        });

        this.sendMessage(ws, this.createHelloAck(session.sessionId));

        for (const player of session.players.values()) {
          if (player.socket !== null) {
            this.sendMessage(
              ws,
              this.createPlayerJoined(player.playerId, player.name),
            );
          }
        }

        return;
      }

      if (session === null) {
        return;
      }

      this.touchConnection(connection, session, now);

      const payload = this.parseSocketPayload(ws, data);

      if (payload === null) {
        return;
      }

      let parsed;

      try {
        parsed = parseHubMessage(payload);
      } catch {
        this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "invalid_message", "Invalid relay message.");
        return;
      }

      switch (parsed.type) {
        case "heartbeat": {
          return;
        }
        case "session_terminated": {
          this.terminateSession(session, parsed.reason);
          return;
        }
        case "plugin_loaded":
        case "start_game":
        case "stop_game": {
          this.log(parsed.type, {
            sessionId: session.sessionId,
          });
          this.broadcastToMobiles(session, parsed);
          return;
        }
        case "ack":
        case "error":
        case "player_joined":
        case "player_left": {
          this.broadcastToMobiles(session, parsed);
          return;
        }
        case "game_state": {
          session.latestGameState = parsed;
          this.broadcastToMobiles(session, parsed);
          return;
        }
        case "hello":
        case "hello_ack":
        case "input": {
          this.sendMessage(ws, this.createError("unsupported_host_message", `Host cannot send ${parsed.type}.`));
          return;
        }
      }
    });

    ws.on("close", () => {
      clearTimeout(handshakeTimer);

      if (connection !== null && session !== null) {
        this.handleHostDisconnect(session, connection);
      }
    });
  }

  private attachMobileSocket(ws: WebSocket, request: IncomingMessage): void {
    const handshakeStartedAt = this.options.now();
    const clientIp = this.getClientIp(request);
    const rateLimit = createRateLimitState(handshakeStartedAt);
    const inputRateLimit = createRateLimitState(handshakeStartedAt);

    let connection: RelayConnection | null = null;
    let session: SessionRecord | null = null;

    const handshakeTimer = setTimeout(() => {
      this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "handshake_timeout", "Handshake timeout.");
    }, this.options.handshakeTimeoutMs);

    ws.on("message", (data: RawData) => {
      const now = this.options.now();

      if (this.isAuthFailureRateLimited(clientIp, now)) {
        this.rejectSocket(
          ws,
          RATE_LIMIT_CLOSE_CODE,
          "rate_limited",
          "Too many authentication failures. Try again later.",
        );
        return;
      }

      if (
        !this.allowRateLimit(
          rateLimit,
          now,
          this.options.rateLimitWindowMs,
          this.options.rateLimitMaxMessages,
        )
      ) {
        this.log("mobile_rate_limited", {
          playerId: connection?.playerId ?? "unknown",
          sessionId: session?.sessionId ?? "unknown",
        });
        this.rejectSocket(ws, RATE_LIMIT_CLOSE_CODE, "rate_limited", "Rate limit exceeded.");
        return;
      }

      if (connection === null) {
        const payload = this.parseSocketPayload(ws, data);

        if (payload === null) {
          return;
        }

        const helloResult = MobileHelloMessageSchema.safeParse(payload);

        if (!helloResult.success) {
          this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "invalid_mobile_hello", "Invalid mobile hello payload.");
          return;
        }

        const hello = helloResult.data;
        const nextSession = this.sessions.get(hello.sessionId) ?? null;

        if (nextSession === null) {
          this.recordAuthFailure(clientIp, now, "session_not_found");
          this.rejectSocket(ws, NOT_FOUND_CLOSE_CODE, "session_not_found", "Session not found.");
          return;
        }

        if (this.isSessionExpired(nextSession, now)) {
          this.recordAuthFailure(clientIp, now, "session_expired");
          this.terminateSession(nextSession, "session_expired");
          this.rejectSocket(ws, NOT_FOUND_CLOSE_CODE, "session_expired", "Session expired.");
          return;
        }

        const connectedPlayer = this.registerMobilePlayer(nextSession, ws, hello, now);

        if (connectedPlayer === null) {
          this.recordAuthFailure(clientIp, now, "invalid_player_token");
          this.rejectSocket(ws, AUTH_CLOSE_CODE, "invalid_player_token", "Invalid player token.");
          return;
        }

        session = nextSession;
        connection = {
          inputRateLimit,
          kind: "mobile",
          lastInputOrderViolationAt: null,
          lastSeen: now,
          lastClientSequence: 0,
          playerId: connectedPlayer.player.playerId,
          rateLimit,
          sequenceBase: connectedPlayer.player.lastAcceptedSequence,
          sessionId: session.sessionId,
          ws,
        };
        session.lastSeen = now;
        clearTimeout(handshakeTimer);

        this.log(connectedPlayer.reconnect ? "mobile_reconnected" : "mobile_connected", {
          playerId: connectedPlayer.player.playerId,
          sessionId: session.sessionId,
        });

        const helloAckState = this.getHelloAckState(
          session,
          connectedPlayer.player.playerId,
        );

        this.sendMessage(
          ws,
          this.createHelloAck(session.sessionId, {
            phase: helloAckState.phase,
            playerId: connectedPlayer.player.playerId,
            playerToken: connectedPlayer.player.playerToken,
            reconnect: connectedPlayer.reconnect,
            role: helloAckState.role,
          }),
        );

        if (session.latestGameState !== null) {
          this.sendMessage(ws, session.latestGameState);
        }

        if (
          session.hostConnection !== null &&
          session.hostConnection.ws.readyState === WebSocket.OPEN
        ) {
          this.sendMessage(
            session.hostConnection.ws,
            this.createPlayerJoined(
              connectedPlayer.player.playerId,
              connectedPlayer.player.name,
              {
                reconnect: connectedPlayer.reconnect,
              },
            ),
          );
        }

        return;
      }

      if (session === null) {
        return;
      }

      this.touchConnection(connection, session, now);

      const payload = this.parseSocketPayload(ws, data);

      if (payload === null) {
        return;
      }

      const heartbeatResult = HeartbeatMessageSchema.safeParse(payload);

      if (heartbeatResult.success) {
        return;
      }

      const inputResult = InputMessageSchema.safeParse(payload);

      if (!inputResult.success) {
        this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "invalid_mobile_message", "Mobile clients may only send heartbeat and input.");
        return;
      }

      if (!this.allowRateLimit(
        connection.inputRateLimit,
        now,
        this.options.inputRateLimitWindowMs,
        this.options.inputRateLimitMaxMessages,
      )) {
        this.notifyInputRateLimited(session, connection, now);
        return;
      }

      const playerId = connection.playerId;
      const player = playerId === undefined ? undefined : session.players.get(playerId);

      if (player === undefined) {
        this.sendMessage(
          ws,
          this.createError(
            "player_not_registered",
            "Player is not registered for this session.",
          ),
        );
        return;
      }

      if (!this.isInputInOrder(player, connection, inputResult.data)) {
        this.notifyInputOutOfOrder(session, connection, inputResult.data.sequence, now);
        return;
      }

      const hostConnection = session.hostConnection;

      if (hostConnection === null || hostConnection.ws.readyState !== WebSocket.OPEN) {
        this.sendMessage(
          ws,
          this.createError(
            "host_unavailable",
            "Host is not connected. Ask the host to reopen or restart the session.",
          ),
        );
        return;
      }

      const effectiveSequence = connection.sequenceBase + inputResult.data.sequence;
      connection.lastClientSequence = inputResult.data.sequence;
      player.lastAcceptedSequence = effectiveSequence;

      const normalizedInput: InputMessage = {
        ...inputResult.data,
        playerId: connection.playerId ?? inputResult.data.playerId,
        sequence: effectiveSequence,
      };

      this.sendMessage(hostConnection.ws, normalizedInput);
    });

    ws.on("close", () => {
      clearTimeout(handshakeTimer);

      if (connection !== null && session !== null) {
        this.handleMobileDisconnect(session, connection);
      }
    });
  }

  private broadcastToMobiles(session: SessionRecord, message: unknown): void {
    for (const player of session.players.values()) {
      if (player.socket !== null && player.socket.readyState === WebSocket.OPEN) {
        this.sendMessage(player.socket, message);
      }
    }
  }

  private cleanupSessions(): void {
    const now = this.options.now();

    for (const session of [...this.sessions.values()]) {
      if (this.isSessionExpired(session, now)) {
        this.terminateSession(session, "session_expired");
        continue;
      }

      if (
        session.hostConnection !== null &&
        now - session.hostConnection.lastSeen > this.options.heartbeatTimeoutMs
      ) {
        this.terminateSession(session, "host_timeout");
        continue;
      }

      for (const player of session.players.values()) {
        if (
          player.socket !== null &&
          now - player.lastSeen > this.options.heartbeatTimeoutMs
        ) {
          const staleSocket = player.socket;
          player.socket = null;
          this.log("mobile_timeout", {
            playerId: player.playerId,
            sessionId: session.sessionId,
          });
          staleSocket.close(SESSION_CLOSE_CODE, closeReason("heartbeat timeout"));

          if (
            session.hostConnection !== null &&
            session.hostConnection.ws.readyState === WebSocket.OPEN
          ) {
            this.sendMessage(
              session.hostConnection.ws,
              this.createPlayerLeft(player.playerId, "timeout"),
            );
          }
        }
      }
    }
  }

  private createError(code: string, message: string): ErrorMessage {
    return {
      code,
      id: randomUUID(),
      message,
      sentAt: this.options.now(),
      type: "error",
    };
  }

  private createHelloAck(
    sessionId: string,
    details: {
      phase?: SessionPhase;
      playerId?: string;
      playerToken?: string;
      reconnect?: boolean;
      role?: PlayerRole;
    } = {},
  ): HelloAckMessage {
    return {
      heartbeatIntervalMs: this.options.heartbeatIntervalMs,
      id: randomUUID(),
      reconnect: details.reconnect ?? false,
      sentAt: this.options.now(),
      sessionId,
      type: "hello_ack",
      ...(details.playerId === undefined ? {} : { playerId: details.playerId }),
      ...(details.playerToken === undefined
        ? {}
        : { playerToken: details.playerToken }),
      ...(details.role === undefined ? {} : { role: details.role }),
      ...(details.phase === undefined ? {} : { phase: details.phase }),
    };
  }

  private createPlayerJoined(
    playerId: string,
    playerName: string,
    details: {
      reconnect?: boolean;
    } = {},
  ): PlayerJoinedMessage {
    return {
      id: randomUUID(),
      playerId,
      playerName,
      sentAt: this.options.now(),
      type: "player_joined",
      ...(details.reconnect === undefined
        ? {}
        : { reconnect: details.reconnect }),
    };
  }

  private createPlayerLeft(
    playerId: string,
    reason?: string,
  ): PlayerLeftMessage {
    return {
      id: randomUUID(),
      playerId,
      sentAt: this.options.now(),
      type: "player_left",
      ...(reason === undefined ? {} : { reason }),
    };
  }

  private createSession(
    ttlMs: number,
  ): CreateSessionResponse {
    const sessionId = randomBytes(8).toString("hex");
    const hostSecret = randomBytes(24).toString("hex");
    const now = this.options.now();
    const expiresAt = now + ttlMs;

    this.sessions.set(sessionId, {
      createdAt: now,
      expiresAt,
      hostConnection: null,
      hostEverConnected: false,
      hostSecret,
      lastSeen: now,
      latestGameState: null,
      players: new Map<string, SessionPlayer>(),
      sessionId,
    });

    return {
      expiresAt,
      hostSecret,
      joinUrl: this.buildJoinUrl(sessionId),
      sessionId,
      ttlMs,
    };
  }

  private createSessionTerminated(
    sessionId: string,
    reason: string,
  ): SessionTerminatedMessage {
    return {
      id: randomUUID(),
      reason,
      sentAt: this.options.now(),
      sessionId,
      type: "session_terminated",
    };
  }

  private findPlayerByToken(
    session: SessionRecord,
    token: string,
  ): SessionPlayer | null {
    for (const player of session.players.values()) {
      if (player.playerToken === token) {
        return player;
      }
    }

    return null;
  }

  private buildJoinUrl(sessionId: string): string {
    if (this.options.publicBaseUrl !== null) {
      return buildJoinUrlFromBaseUrl(this.options.publicBaseUrl, sessionId);
    }

    return buildJoinUrlFromBaseUrl(this.getLocalBaseUrl(), sessionId);
  }

  private getLocalBaseUrl(): string {
    const address = this.server.address();
    const port =
      address !== null && typeof address !== "string"
        ? address.port
        : this.options.port;
    const rawHost =
      address !== null && typeof address !== "string"
        ? address.address
        : this.options.host;
    const host =
      rawHost === "0.0.0.0" || rawHost === "::" || rawHost === ""
        ? "127.0.0.1"
        : rawHost === "::1"
          ? "localhost"
          : rawHost;

    return `http://${host}:${port}/`;
  }

  private async handleCreateSession(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const now = this.options.now();
    const clientIp = this.getClientIp(request);

    if (!this.allowIpRateLimit(
      this.createSessionRateLimits,
      clientIp,
      now,
      this.options.createSessionRateLimitWindowMs,
      this.options.createSessionRateLimitMaxRequests,
    )) {
      throw new RequestError(429, "rate_limited");
    }

    const payload = await this.readJsonBody(request);
    const parsed = CreateSessionRequestSchema.parse(payload);
    const ttlMs = parsed.ttlMs ?? this.options.sessionTtlMs;
    const session = this.createSession(ttlMs);

    this.writeJson(response, 201, session);
  }

  private getHelloAckState(
    session: SessionRecord,
    playerId: string,
  ): { phase: SessionPhase; role: PlayerRole } {
    const fallbackPhase: SessionPhase =
      session.hostConnection !== null &&
      session.hostConnection.ws.readyState === WebSocket.OPEN
        ? "lobby"
        : "idle";

    if (session.latestGameState === null) {
      return {
        phase: fallbackPhase,
        role: "player",
      };
    }

    const parsedState = safeParseHostStatePayload(session.latestGameState.state);

    if (!parsedState.success) {
      return {
        phase: fallbackPhase,
        role: "player",
      };
    }

    const player = parsedState.data.players.find(
      (candidate) => candidate.playerId === playerId,
    );

    return {
      phase: parsedState.data.lifecycle,
      role: player?.role ?? "player",
    };
  }

  private handleHostDisconnect(
    session: SessionRecord,
    connection: RelayConnection,
  ): void {
    if (session.hostConnection?.ws !== connection.ws) {
      return;
    }

    session.hostConnection = null;
    this.log("host_disconnected", {
      sessionId: session.sessionId,
    });

    if (session.hostEverConnected) {
      this.terminateSession(session, "host_disconnected");
    }
  }

  private async handleHttpRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      const pathname = this.getRequestPathname(request);

      if (request.method === "POST" && pathname === "/api/session/create") {
        await this.handleCreateSession(request, response);
        return;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        await this.serveStaticAsset(request, response, pathname);
        return;
      }

      this.writeJson(response, 404, {
        error: "not_found",
        message: "Route not found.",
      });
    } catch (error) {
      if (error instanceof RequestError) {
        this.writeJson(response, error.statusCode, {
          error: error.code,
          message: describeHttpError(error.code),
        });
        return;
      }

      if (error instanceof z.ZodError) {
        this.writeJson(response, 400, {
          error: "invalid_request",
          issues: error.issues,
          message: "Request body does not match the expected schema.",
        });
        return;
      }

      if (error instanceof SyntaxError) {
        this.writeJson(response, 400, {
          error: "invalid_json",
          message: "Request body is not valid JSON.",
        });
        return;
      }

      this.writeJson(response, 500, {
        error: "internal_error",
        message: "Relay failed to process the request.",
      });
    }
  }

  private handleMobileDisconnect(
    session: SessionRecord,
    connection: RelayConnection,
  ): void {
    const playerId = connection.playerId;

    if (playerId === undefined) {
      return;
    }

    const player = session.players.get(playerId);

    if (player === undefined || player.socket !== connection.ws) {
      return;
    }

    player.lastSeen = this.options.now();
    player.socket = null;

    this.log("mobile_disconnected", {
      playerId,
      sessionId: session.sessionId,
    });

    if (
      session.hostConnection !== null &&
      session.hostConnection.ws.readyState === WebSocket.OPEN
    ) {
      this.sendMessage(
        session.hostConnection.ws,
        this.createPlayerLeft(playerId, "disconnect"),
      );
    }
  }

  private isAllowedMobileOrigin(request: IncomingMessage): boolean {
    const originHeader = request.headers.origin;

    if (typeof originHeader !== "string") {
      return false;
    }

    const normalizedOrigin = normalizeOrigin(originHeader);

    if (normalizedOrigin === null) {
      return false;
    }

    const allowedOrigins = this.getAllowedWebOrigins();
    return allowedOrigins.includes(normalizedOrigin);
  }

  private getAllowedWebOrigins(): string[] {
    const origins = new Set(this.options.allowedWebOrigins);

    if (this.options.publicBaseUrl !== null) {
      origins.add(new URL(this.options.publicBaseUrl).origin);
    }

    const localBaseUrl = this.getLocalBaseUrl();
    const localUrl = new URL(localBaseUrl);
    origins.add(localUrl.origin);

    if (localUrl.hostname === "127.0.0.1") {
      origins.add(`http://localhost:${localUrl.port}`);
    }

    if (localUrl.hostname === "localhost") {
      origins.add(`http://127.0.0.1:${localUrl.port}`);
    }

    return [...origins];
  }

  private isAuthFailureRateLimited(ip: string, now: number): boolean {
    const state = this.authFailureRateLimits.get(ip);

    if (state === undefined) {
      return false;
    }

    if (now - state.windowStartedAt >= this.options.authFailureRateLimitWindowMs) {
      this.authFailureRateLimits.delete(ip);
      return false;
    }

    return state.messageCount >= this.options.authFailureRateLimitMaxAttempts;
  }

  private recordAuthFailure(ip: string, now: number, reason: string): void {
    const state = this.authFailureRateLimits.get(ip) ?? createRateLimitState(now);

    if (now - state.windowStartedAt >= this.options.authFailureRateLimitWindowMs) {
      state.windowStartedAt = now;
      state.messageCount = 0;
    }

    state.messageCount += 1;
    state.lastViolationAt = now;
    this.authFailureRateLimits.set(ip, state);

    this.log("auth_failure", {
      ip,
      reason,
    });
  }

  private isInputInOrder(
    player: SessionPlayer,
    connection: RelayConnection,
    message: InputMessage,
  ): boolean {
    if (message.sequence <= connection.lastClientSequence) {
      return false;
    }

    const effectiveSequence = connection.sequenceBase + message.sequence;
    return effectiveSequence > player.lastAcceptedSequence;
  }

  private isSessionExpired(session: SessionRecord, now: number): boolean {
    return session.expiresAt <= now;
  }

  private log(event: string, details: Record<string, string>): void {
    console.log(`[relay] ${event} ${JSON.stringify(details)}`);
  }


  private parseSocketPayload(ws: WebSocket, data: RawData): unknown | null {
    const buffer = rawDataToBuffer(data);

    if (buffer.byteLength > this.options.maxMessageBytes) {
      this.rejectSocket(
        ws,
        PROTOCOL_CLOSE_CODE,
        "payload_too_large",
        "Message exceeds the maximum allowed size.",
      );
      return null;
    }

    try {
      return JSON.parse(buffer.toString("utf8")) as unknown;
    } catch {
      this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "invalid_json", "Message is not valid JSON.");
      return null;
    }
  }

  private async readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of request) {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
      totalBytes += buffer.byteLength;

      if (totalBytes > this.options.maxBodyBytes) {
        throw new RequestError(413, "payload_too_large");
      }

      chunks.push(buffer);
    }

    if (chunks.length === 0) {
      return {};
    }

    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  }

  private registerMobilePlayer(
    session: SessionRecord,
    ws: WebSocket,
    hello: z.infer<typeof MobileHelloMessageSchema>,
    now: number,
  ): { player: SessionPlayer; reconnect: boolean } | null {
    if (hello.token !== undefined) {
      const existingPlayer = this.findPlayerByToken(session, hello.token);

      if (existingPlayer === null) {
        return null;
      }

      if (
        existingPlayer.socket !== null &&
        existingPlayer.socket !== ws &&
        existingPlayer.socket.readyState === WebSocket.OPEN
      ) {
        existingPlayer.socket.close(
          CONFLICT_CLOSE_CODE,
          closeReason("reconnected from another client"),
        );
      }

      existingPlayer.lastSeen = now;
      existingPlayer.socket = ws;
      return {
        player: existingPlayer,
        reconnect: true,
      };
    }

    const player: SessionPlayer = {
      lastAcceptedSequence: 0,
      lastSeen: now,
      name: hello.name ?? `Player ${session.players.size + 1}`,
      playerId: `player_${randomBytes(4).toString("hex")}`,
      playerToken: randomBytes(16).toString("hex"),
      socket: ws,
    };

    session.players.set(player.playerId, player);
    return {
      player,
      reconnect: false,
    };
  }

  private notifyInputRateLimited(
    session: SessionRecord,
    connection: RelayConnection,
    _now: number,
  ): void {
    this.log("mobile_input_rate_limited", {
      playerId: connection.playerId ?? "unknown",
      sessionId: session.sessionId,
    });

    this.sendMessage(
      connection.ws,
      this.createError("rate_limited", "Input rate limit exceeded."),
    );
  }

  private notifyInputOutOfOrder(
    session: SessionRecord,
    connection: RelayConnection,
    attemptedSequence: number,
    now: number,
  ): void {
    const shouldNotify =
      connection.lastInputOrderViolationAt === null ||
      now - connection.lastInputOrderViolationAt >=
        DEFAULT_INPUT_ORDER_VIOLATION_NOTIFY_INTERVAL_MS;

    connection.lastInputOrderViolationAt = now;

    if (!shouldNotify) {
      return;
    }

    this.log("mobile_input_out_of_order", {
      attemptedSequence: String(attemptedSequence),
      playerId: connection.playerId ?? "unknown",
      sessionId: session.sessionId,
    });

    this.sendMessage(
      connection.ws,
      this.createError(
        "input_out_of_order",
        "Input sequence must be strictly increasing.",
      ),
    );
  }

  private rejectSocket(
    ws: WebSocket,
    closeCode: number,
    errorCode: string,
    message: string,
  ): void {
    if (ws.readyState === WebSocket.OPEN) {
      this.sendMessage(ws, this.createError(errorCode, message));
      ws.close(closeCode, closeReason(message));
      return;
    }

    if (ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
  }

  private async serveStaticAsset(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const normalizedPath = pathname === "/" ? "/index.html" : pathname;
    let assetPath = resolve(this.options.mobileDistDir, `.${normalizedPath}`);
    const relativePath = relative(this.options.mobileDistDir, assetPath);

    if (relativePath.startsWith("..")) {
      this.writeJson(response, 404, {
        error: "not_found",
        message: "Asset not found.",
      });
      return;
    }

    if (!existsSync(assetPath)) {
      if (extname(normalizedPath) === "") {
        assetPath = resolve(this.options.mobileDistDir, "index.html");
      } else {
        this.writeJson(response, 404, {
          error: "not_found",
          message: "Asset not found.",
        });
        return;
      }
    }

    const body = await readFile(assetPath);
    const contentType = contentTypeForPath(assetPath);
    const headers = {
      ...createStaticSecurityHeaders(contentType),
      "cache-control": contentType.startsWith("text/html")
        ? "no-store"
        : "public, max-age=31536000, immutable",
    };

    response.writeHead(200, headers);

    if (request.method !== "HEAD") {
      response.end(body);
      return;
    }

    response.end();
  }

  private sendMessage(ws: WebSocket, message: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(JSON.stringify(message));
  }

  private terminateSession(session: SessionRecord, reason: string): void {
    if (!this.sessions.has(session.sessionId)) {
      return;
    }

    this.sessions.delete(session.sessionId);
    session.expiresAt = this.options.now();

    this.log("session_terminated", {
      reason,
      sessionId: session.sessionId,
    });

    const terminatedMessage = this.createSessionTerminated(session.sessionId, reason);
    const hostConnection = session.hostConnection;
    session.hostConnection = null;

    if (hostConnection !== null && hostConnection.ws.readyState === WebSocket.OPEN) {
      this.sendMessage(hostConnection.ws, terminatedMessage);
      hostConnection.ws.close(SESSION_CLOSE_CODE, closeReason(reason));
    }

    for (const player of session.players.values()) {
      const playerSocket = player.socket;
      player.socket = null;

      if (playerSocket !== null && playerSocket.readyState === WebSocket.OPEN) {
        this.sendMessage(playerSocket, terminatedMessage);
        playerSocket.close(SESSION_CLOSE_CODE, closeReason(reason));
      }
    }
  }

  private touchConnection(
    connection: RelayConnection,
    session: SessionRecord,
    now: number,
  ): void {
    connection.lastSeen = now;
    session.lastSeen = now;

    if (connection.playerId !== undefined) {
      const player = session.players.get(connection.playerId);

      if (player !== undefined) {
        player.lastSeen = now;
      }
    }
  }

  private getRequestPathname(request: IncomingMessage): string {
    return new URL(request.url ?? "/", "http://relay.local").pathname;
  }

  private getClientIp(request: IncomingMessage): string {
    return normalizeIpAddress(request.socket.remoteAddress);
  }

  private writeJson(
    response: ServerResponse,
    statusCode: number,
    payload: unknown,
  ): void {
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    response.writeHead(statusCode, {
      ...createCommonSecurityHeaders(),
      "cache-control": "no-store",
      "content-length": String(body.byteLength),
      "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "content-type": "application/json; charset=utf-8",
    });
    response.end(body);
  }
}

export function createRelayServer(options: RelayServerOptions = {}): RelayServer {
  return new RelayServer(options);
}


