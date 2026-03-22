import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
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
const DEFAULT_INPUT_RATE_LIMIT_WINDOW_MS = 1000;
const DEFAULT_INPUT_RATE_LIMIT_MAX_MESSAGES = 30;
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
  lastSeen: number;
  playerId?: string;
  rateLimit: RateLimitState;
  sessionId: string;
  ws: WebSocket;
}

interface SessionPlayer {
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
  cleanupIntervalMs?: number;
  handshakeTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  host?: string;
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
  cleanupIntervalMs: number;
  handshakeTimeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  host: string;
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

export class RelayServer {
  private readonly hostWss = new WebSocketServer({ noServer: true });
  private readonly mobileWss = new WebSocketServer({ noServer: true });
  private readonly options: NormalizedRelayServerOptions;
  private readonly server = createServer((request, response) => {
    void this.handleHttpRequest(request, response);
  });
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(options: RelayServerOptions = {}) {
    this.options = {
      cleanupIntervalMs:
        options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS,
      handshakeTimeoutMs:
        options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
      heartbeatIntervalMs:
        options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs:
        options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS,
      host: options.host ?? DEFAULT_HOST,
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

    this.hostWss.on("connection", (ws: WebSocket) => {
      this.attachHostSocket(ws);
    });

    this.mobileWss.on("connection", (ws: WebSocket) => {
      this.attachMobileSocket(ws);
    });

    this.server.on("upgrade", (request, socket, head) => {
      const pathname = this.getRequestPathname(request);

      if (pathname === "/ws/host") {
        this.hostWss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.hostWss.emit("connection", ws, request);
        });
        return;
      }

      if (pathname === "/ws/mobile") {
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

  private attachHostSocket(ws: WebSocket): void {
    const handshakeStartedAt = this.options.now();
    const rateLimit = createRateLimitState(handshakeStartedAt);
    const inputRateLimit = createRateLimitState(handshakeStartedAt);

    let connection: RelayConnection | null = null;
    let session: SessionRecord | null = null;

    const handshakeTimer = setTimeout(() => {
      this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "handshake_timeout", "Handshake timeout.");
    }, this.options.handshakeTimeoutMs);

    ws.on("message", (data: RawData) => {
      const now = this.options.now();

      if (!this.allowRateLimit(rateLimit, now, this.options.rateLimitWindowMs, this.options.rateLimitMaxMessages)) {
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
          this.rejectSocket(ws, NOT_FOUND_CLOSE_CODE, "session_not_found", "Session not found.");
          return;
        }

        if (this.isSessionExpired(nextSession, now)) {
          this.terminateSession(nextSession, "session_expired");
          this.rejectSocket(ws, NOT_FOUND_CLOSE_CODE, "session_expired", "Session expired.");
          return;
        }

        if (nextSession.hostSecret !== hello.token) {
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
          lastSeen: now,
          rateLimit,
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
              this.createPlayerJoined(player.playerId, player.name, {
                playerToken: player.playerToken,
              }),
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

  private attachMobileSocket(ws: WebSocket): void {
    const handshakeStartedAt = this.options.now();
    const rateLimit = createRateLimitState(handshakeStartedAt);
    const inputRateLimit = createRateLimitState(handshakeStartedAt);

    let connection: RelayConnection | null = null;
    let session: SessionRecord | null = null;

    const handshakeTimer = setTimeout(() => {
      this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "handshake_timeout", "Handshake timeout.");
    }, this.options.handshakeTimeoutMs);

    ws.on("message", (data: RawData) => {
      const now = this.options.now();

      if (!this.allowRateLimit(rateLimit, now, this.options.rateLimitWindowMs, this.options.rateLimitMaxMessages)) {
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
          this.rejectSocket(ws, NOT_FOUND_CLOSE_CODE, "session_not_found", "Session not found.");
          return;
        }

        if (this.isSessionExpired(nextSession, now)) {
          this.terminateSession(nextSession, "session_expired");
          this.rejectSocket(ws, NOT_FOUND_CLOSE_CODE, "session_expired", "Session expired.");
          return;
        }

        const connectedPlayer = this.registerMobilePlayer(nextSession, ws, hello, now);

        if (connectedPlayer === null) {
          this.rejectSocket(ws, AUTH_CLOSE_CODE, "invalid_player_token", "Invalid player token.");
          return;
        }

        session = nextSession;
        connection = {
          inputRateLimit,
          kind: "mobile",
          lastSeen: now,
          playerId: connectedPlayer.player.playerId,
          rateLimit,
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
                playerToken: connectedPlayer.player.playerToken,
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

      const normalizedInput: InputMessage = {
        ...inputResult.data,
        playerId: connection.playerId ?? inputResult.data.playerId,
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
      playerToken?: string;
      reconnect?: boolean;
    } = {},
  ): PlayerJoinedMessage {
    return {
      id: randomUUID(),
      playerId,
      playerName,
      sentAt: this.options.now(),
      type: "player_joined",
      ...(details.playerToken === undefined
        ? {}
        : { playerToken: details.playerToken }),
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
    request: IncomingMessage,
  ): CreateSessionResponse {
    const sessionId = randomBytes(6).toString("hex");
    const hostSecret = randomBytes(18).toString("hex");
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
      joinUrl: this.buildJoinUrl(request, sessionId),
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

  private buildJoinUrl(request: IncomingMessage, sessionId: string): string {
    if (this.options.publicBaseUrl !== null) {
      return buildJoinUrlFromBaseUrl(this.options.publicBaseUrl, sessionId);
    }

    const host = request.headers.host ?? `localhost:${this.options.port}`;
    const forwardedProtocol = request.headers["x-forwarded-proto"];
    const protocol =
      typeof forwardedProtocol === "string"
        ? forwardedProtocol.split(",")[0]?.trim() || "http"
        : "http";

    return buildJoinUrlFromBaseUrl(`${protocol}://${host}/`, sessionId);
  }

  private async handleCreateSession(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const payload = await this.readJsonBody(request);
    const parsed = CreateSessionRequestSchema.parse(payload);
    const ttlMs = parsed.ttlMs ?? this.options.sessionTtlMs;
    const session = this.createSession(ttlMs, request);

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

  private isSessionExpired(session: SessionRecord, now: number): boolean {
    return session.expiresAt <= now;
  }

  private log(event: string, details: Record<string, string>): void {
    console.log(`[relay] ${event} ${JSON.stringify(details)}`);
  }

  private parseSocketPayload(ws: WebSocket, data: RawData): unknown | null {
    const buffer = rawDataToBuffer(data);

    if (buffer.length > this.options.maxMessageBytes) {
      this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "message_too_large", "Message too large.");
      return null;
    }

    try {
      return JSON.parse(buffer.toString("utf8")) as unknown;
    } catch {
      this.rejectSocket(ws, PROTOCOL_CLOSE_CODE, "invalid_json", "Invalid JSON payload.");
      return null;
    }
  }

  private async readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let totalLength = 0;

    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk));
      totalLength += buffer.length;

      if (totalLength > this.options.maxBodyBytes) {
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
          SESSION_CLOSE_CODE,
          closeReason("reconnected from another device"),
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
      lastSeen: now,
      name: hello.name?.trim() || `Player ${session.players.size + 1}`,
      playerId: `player_${randomBytes(4).toString("hex")}`,
      playerToken: randomBytes(12).toString("hex"),
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
    now: number,
  ): void {
    if (
      connection.inputRateLimit.lastViolationAt !== null &&
      now - connection.inputRateLimit.lastViolationAt < 1000
    ) {
      return;
    }

    connection.inputRateLimit.lastViolationAt = now;
    this.log("mobile_input_rate_limited", {
      playerId: connection.playerId ?? "unknown",
      sessionId: session.sessionId,
    });
    this.sendMessage(
      connection.ws,
      this.createError(
        "input_rate_limited",
        `Too many input messages. Limit is ${this.options.inputRateLimitMaxMessages} per second.`,
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
    }
  }

  private async serveStaticAsset(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    if (!existsSync(this.options.mobileDistDir)) {
      this.writeJson(response, 503, {
        error: "mobile_build_missing",
        message: "Mobile build is missing. Run the build before serving static assets.",
      });
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(this.options.mobileDistDir, relativePath);
    const escapedPath = relative(this.options.mobileDistDir, filePath);

    if (escapedPath.startsWith("..")) {
      this.writeJson(response, 403, {
        error: "forbidden",
        message: "Requested asset is outside the mobile build directory.",
      });
      return;
    }

    if (!existsSync(filePath)) {
      this.writeJson(response, 404, {
        error: "not_found",
        message: "Static asset not found.",
      });
      return;
    }

    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypeForPath(filePath),
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    response.end(file);
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

    const terminationMessage = this.createSessionTerminated(session.sessionId, reason);

    this.log("session_terminated", {
      reason,
      sessionId: session.sessionId,
    });

    if (
      session.hostConnection !== null &&
      session.hostConnection.ws.readyState === WebSocket.OPEN
    ) {
      this.sendMessage(session.hostConnection.ws, terminationMessage);
      session.hostConnection.ws.close(SESSION_CLOSE_CODE, closeReason(reason));
    }

    for (const player of session.players.values()) {
      if (player.socket !== null && player.socket.readyState === WebSocket.OPEN) {
        this.sendMessage(player.socket, terminationMessage);
        player.socket.close(SESSION_CLOSE_CODE, closeReason(reason));
      }

      player.socket = null;
    }

    session.hostConnection = null;
    this.sessions.delete(session.sessionId);
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
    return new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`,
    ).pathname;
  }

  private writeJson(
    response: ServerResponse,
    statusCode: number,
    payload: unknown,
  ): void {
    response.writeHead(statusCode, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(payload));
  }
}
function buildJoinUrlFromBaseUrl(baseUrl: string, sessionId: string): string {
  const url = new URL(baseUrl);
  url.hash = "";
  url.search = "";
  url.searchParams.set("sessionId", sessionId);
  return url.toString();
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


export function createRelayServer(options: RelayServerOptions = {}): RelayServer {
  return new RelayServer(options);
}






