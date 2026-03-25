import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";
import type { GameManifest } from "@game-hub/sdk";
import WebSocket from "ws";

import { HostService } from "../src/host-service.js";

interface MutableHostServiceInternals {
  pluginRuntime: FakePluginRuntime;
  sessionStore: {
    markRelayStatus(relayStatus: string, now: number): void;
    resetSession(params: { joinUrl: string; now: number; sessionId: string }): void;
    setGameState(gameState: Record<string, unknown> | null, now: number): void;
    setLifecycle(lifecycle: string, now: number): void;
    setSelectedGame(gameId: string, now: number): void;
  };
  socket:
    | {
        readyState: number;
        send(payload: string): void;
      }
    | FakeRelaySocket
    | null;
}

interface FakePluginRuntime {
  getAvailableManifests(): GameManifest[];
  getGameState(): Record<string, unknown> | null;
  handleGameStart(): void;
  handleGameStop(): void;
  handleHostAction(): void;
  handleInput(): void;
  handlePlayerJoined(): void;
  handlePlayerLeft(): void;
  handleSessionCreated(): Promise<void>;
  initialize(): Promise<void>;
  reinitializeActivePlugin(): Promise<GameManifest | null>;
  reset(): void;
  selectPlugin(gameId: string): Promise<GameManifest>;
}

interface FakeRelaySocketOptions {
  autoAcknowledge?: boolean;
  autoOpen?: boolean;
  closeDelayMs?: number;
  throwOnCloseWhileConnecting?: boolean;
}

class FakeRelaySocket extends EventEmitter {
  readonly closeCalls: Array<{ code: number; reason: string }> = [];
  readonly sentPayloads: string[] = [];
  terminateCalls = 0;
  readyState = WebSocket.CONNECTING;

  constructor(
    readonly url: string,
    private readonly options: FakeRelaySocketOptions = {},
  ) {
    super();

    if (options.autoOpen !== false) {
      queueMicrotask(() => {
        this.emitOpen();
      });
    }
  }

  close(code = 1000, reason = ""): void {
    this.closeCalls.push({ code, reason });

    if (
      this.readyState === WebSocket.CONNECTING &&
      this.options.throwOnCloseWhileConnecting !== false
    ) {
      throw new Error("WebSocket was closed before the connection was established");
    }

    this.readyState = WebSocket.CLOSING;
    const emitClose = () => {
      this.readyState = WebSocket.CLOSED;
      this.emit("close", code);
    };

    if ((this.options.closeDelayMs ?? 0) > 0) {
      setTimeout(emitClose, this.options.closeDelayMs);
      return;
    }

    queueMicrotask(emitClose);
  }

  emitClose(code = 1000): void {
    this.readyState = WebSocket.CLOSED;
    this.emit("close", code);
  }

  send(payload: string): void {
    this.sentPayloads.push(payload);
    const parsed = JSON.parse(payload) as { sessionId?: string; type: string };

    if (parsed.type === "hello" && this.options.autoAcknowledge !== false) {
      queueMicrotask(() => {
        this.emit(
          "message",
          Buffer.from(
            JSON.stringify({
              heartbeatIntervalMs: 5_000,
              id: "hello-ack",
              sentAt: Date.now(),
              sessionId: parsed.sessionId ?? "session-test",
              type: "hello_ack",
            }),
          ),
        );
      });
    }
  }

  terminate(): void {
    this.terminateCalls += 1;

    if (this.readyState === WebSocket.CLOSED) {
      return;
    }

    this.readyState = WebSocket.CLOSED;
    queueMicrotask(() => {
      this.emit("close", 1006);
    });
  }

  private emitOpen(): void {
    if (this.readyState !== WebSocket.CONNECTING) {
      return;
    }

    this.readyState = WebSocket.OPEN;
    this.emit("open");
  }
}

function createWebSocketCtor(
  sockets: FakeRelaySocket[],
  optionsFactory: (index: number) => FakeRelaySocketOptions = () => ({}),
): typeof WebSocket {
  return class TestWebSocket extends FakeRelaySocket {
    constructor(url: string) {
      super(url, optionsFactory(sockets.length));
      sockets.push(this);
    }
  } as unknown as typeof WebSocket;
}

function createSessionResponse(sessionId: string, joinUrl: string): Response {
  return new Response(
    JSON.stringify({
      expiresAt: Date.now() + 60_000,
      hostSecret: `${sessionId}-secret`,
      joinUrl,
      sessionId,
      ttlMs: 60_000,
    }),
    {
      headers: {
        "content-type": "application/json",
      },
      status: 200,
    },
  );
}

describe("HostService", () => {
  it("restarts the selected game without changing the session", async () => {
    let now = 100;
    let currentState: Record<string, unknown> | null = {
      round: 7,
      stage: "game_over",
    };
    const sentMessages: Array<{ type: string }> = [];
    const manifest: GameManifest = {
      description: "Snake",
      displayName: "Snake",
      id: "snake",
      supportsTeams: false,
      tickHz: 12,
      version: "0.2.0",
    };

    const service = new HostService({ now: () => now });
    const internals = service as unknown as MutableHostServiceInternals;
    internals.pluginRuntime = {
      getAvailableManifests: () => [manifest],
      getGameState: () => currentState,
      handleGameStart: () => {
        currentState = {
          round: 1,
          stage: "running",
        };
      },
      handleGameStop: () => {
        currentState = {
          round: 0,
          stage: "stopped",
        };
      },
      handleHostAction: () => undefined,
      handleInput: () => undefined,
      handlePlayerJoined: () => undefined,
      handlePlayerLeft: () => undefined,
      handleSessionCreated: async () => undefined,
      initialize: async () => undefined,
      reinitializeActivePlugin: async () => {
        currentState = {
          round: 0,
          stage: "lobby",
        };
        return manifest;
      },
      reset: () => {
        currentState = null;
      },
      selectPlugin: async () => manifest,
    };
    internals.socket = {
      readyState: 1,
      send(payload: string) {
        sentMessages.push(JSON.parse(payload) as { type: string });
      },
    };

    internals.sessionStore.resetSession({
      joinUrl: "https://relay.example/?sessionId=session-1",
      now,
      sessionId: "session-1",
    });
    internals.sessionStore.markRelayStatus("connected", now + 1);
    internals.sessionStore.setSelectedGame("snake", now + 2);
    internals.sessionStore.setGameState(currentState, now + 3);
    internals.sessionStore.setLifecycle("game_finished", now + 4);

    now = 200;
    await service.restartGame();

    const snapshot = service.getSnapshot();
    expect(snapshot.sessionId).toBe("session-1");
    expect(snapshot.joinUrl).toBe("https://relay.example/?sessionId=session-1");
    expect(snapshot.selectedGame).toBe("snake");
    expect(snapshot.lifecycle).toBe("game_running");
    expect(snapshot.gameState).toEqual({ round: 1, stage: "running" });
    expect(sentMessages.map((message) => message.type)).toEqual([
      "game_state",
      "plugin_loaded",
      "game_state",
      "start_game",
      "game_state",
    ]);
  });

  it("rejects switching games while a round is running", async () => {
    let now = 10;
    const snakeManifest: GameManifest = {
      description: "Snake",
      displayName: "Snake",
      id: "snake",
      supportsTeams: false,
      tickHz: 12,
      version: "0.2.0",
    };
    const triviaManifest: GameManifest = {
      description: "Trivia",
      displayName: "Trivia",
      id: "trivia",
      supportsTeams: true,
      tickHz: 1,
      version: "0.2.0",
    };
    let selectPluginCalls = 0;

    const service = new HostService({ now: () => now });
    const internals = service as unknown as MutableHostServiceInternals;
    internals.pluginRuntime = {
      getAvailableManifests: () => [snakeManifest, triviaManifest],
      getGameState: () => ({ stage: "running" }),
      handleGameStart: () => undefined,
      handleGameStop: () => undefined,
      handleHostAction: () => undefined,
      handleInput: () => undefined,
      handlePlayerJoined: () => undefined,
      handlePlayerLeft: () => undefined,
      handleSessionCreated: async () => undefined,
      initialize: async () => undefined,
      reinitializeActivePlugin: async () => snakeManifest,
      reset: () => undefined,
      selectPlugin: async () => {
        selectPluginCalls += 1;
        return triviaManifest;
      },
    };

    internals.sessionStore.resetSession({
      joinUrl: "https://relay.example/?sessionId=session-2",
      now,
      sessionId: "session-2",
    });
    internals.sessionStore.markRelayStatus("connected", now + 1);
    internals.sessionStore.setSelectedGame("snake", now + 2);
    internals.sessionStore.setLifecycle("game_running", now + 3);

    now = 20;
    await service.selectGame("trivia");

    expect(service.getSnapshot().selectedGame).toBe("snake");
    expect(selectPluginCalls).toBe(0);
    expect(service.getDiagnostics()[0]?.type).toBe("select_game_while_running");
  });

  it("drops oversized game state broadcasts and emits a diagnostic", async () => {
    let now = 1_000;
    const currentState: Record<string, unknown> | null = {
      blob: "x".repeat(8_000),
    };
    const sentMessages: Array<{ type: string }> = [];
    const manifest: GameManifest = {
      description: "Snake",
      displayName: "Snake",
      id: "snake",
      supportsTeams: false,
      tickHz: 12,
      version: "0.2.0",
    };

    const service = new HostService({ now: () => now });
    const internals = service as unknown as MutableHostServiceInternals;
    internals.pluginRuntime = {
      getAvailableManifests: () => [manifest],
      getGameState: () => currentState,
      handleGameStart: () => undefined,
      handleGameStop: () => undefined,
      handleHostAction: () => undefined,
      handleInput: () => undefined,
      handlePlayerJoined: () => undefined,
      handlePlayerLeft: () => undefined,
      handleSessionCreated: async () => undefined,
      initialize: async () => undefined,
      reinitializeActivePlugin: async () => manifest,
      reset: () => undefined,
      selectPlugin: async () => manifest,
    };
    internals.socket = {
      readyState: 1,
      send(payload: string) {
        sentMessages.push(JSON.parse(payload) as { type: string });
      },
    };

    internals.sessionStore.resetSession({
      joinUrl: "https://relay.example/?sessionId=session-3",
      now,
      sessionId: "session-3",
    });
    internals.sessionStore.markRelayStatus("connected", now + 1);
    internals.sessionStore.setSelectedGame("snake", now + 2);
    internals.sessionStore.setLifecycle("game_finished", now + 3);

    now = 2_000;
    await service.restartGame();

    expect(sentMessages.map((message) => message.type)).toEqual([
      "game_state",
      "plugin_loaded",
      "start_game",
    ]);
    expect(
      service.getDiagnostics().some((event) => event.type === "game_state_too_large"),
    ).toBe(true);
  });

  it("restarts the session without throwing when the existing socket is still connecting", async () => {
    let now = 300;
    const sockets: FakeRelaySocket[] = [];
    const service = new HostService({
      fetchImpl: async () =>
        createSessionResponse(
          "session-new",
          "https://relay.example/?sessionId=session-new",
        ),
      now: () => now,
      webSocketCtor: createWebSocketCtor(sockets),
    });
    const internals = service as unknown as MutableHostServiceInternals;
    const manifest: GameManifest = {
      description: "Snake",
      displayName: "Snake",
      id: "snake",
      supportsTeams: false,
      tickHz: 12,
      version: "0.2.0",
    };
    const oldSocket = new FakeRelaySocket("ws://relay.example/ws/host", {
      autoOpen: false,
    });

    internals.pluginRuntime = {
      getAvailableManifests: () => [manifest],
      getGameState: () => null,
      handleGameStart: () => undefined,
      handleGameStop: () => undefined,
      handleHostAction: () => undefined,
      handleInput: () => undefined,
      handlePlayerJoined: () => undefined,
      handlePlayerLeft: () => undefined,
      handleSessionCreated: async () => undefined,
      initialize: async () => undefined,
      reinitializeActivePlugin: async () => manifest,
      reset: () => undefined,
      selectPlugin: async () => manifest,
    };

    internals.sessionStore.resetSession({
      joinUrl: "https://relay.example/?sessionId=session-old",
      now,
      sessionId: "session-old",
    });
    internals.sessionStore.markRelayStatus("connecting", now + 1);
    internals.sessionStore.setLifecycle("lobby", now + 2);
    internals.socket = oldSocket;

    now = 400;
    await expect(service.restartSession()).resolves.toBeUndefined();

    const snapshot = service.getSnapshot();
    expect(snapshot.sessionId).toBe("session-new");
    expect(snapshot.joinUrl).toBe("https://relay.example/?sessionId=session-new");
    expect(snapshot.relayStatus).toBe("connected");
    expect(oldSocket.closeCalls).toHaveLength(0);
    expect(oldSocket.terminateCalls).toBe(1);
    expect(sockets).toHaveLength(1);
  });

  it("ignores stale socket close events after a newer socket becomes active", async () => {
    const sockets: FakeRelaySocket[] = [];
    const service = new HostService({
      fetchImpl: async () =>
        createSessionResponse(
          "session-stale",
          "https://relay.example/?sessionId=session-stale",
        ),
      webSocketCtor: createWebSocketCtor(sockets),
    });
    const manifest: GameManifest = {
      description: "Snake",
      displayName: "Snake",
      id: "snake",
      supportsTeams: false,
      tickHz: 12,
      version: "0.2.0",
    };
    const internals = service as unknown as MutableHostServiceInternals;

    internals.pluginRuntime = {
      getAvailableManifests: () => [manifest],
      getGameState: () => null,
      handleGameStart: () => undefined,
      handleGameStop: () => undefined,
      handleHostAction: () => undefined,
      handleInput: () => undefined,
      handlePlayerJoined: () => undefined,
      handlePlayerLeft: () => undefined,
      handleSessionCreated: async () => undefined,
      initialize: async () => undefined,
      reinitializeActivePlugin: async () => manifest,
      reset: () => undefined,
      selectPlugin: async () => manifest,
    };

    await service.start();

    const firstSocket = sockets[0];
    const replacementSocket = new FakeRelaySocket("ws://relay.example/ws/host", {
      autoOpen: false,
    });
    internals.socket = replacementSocket;

    firstSocket?.emitClose(1006);

    const snapshot = service.getSnapshot();
    expect(snapshot.sessionId).toBe("session-stale");
    expect(snapshot.lifecycle).toBe("lobby");
    expect(snapshot.relayStatus).toBe("connected");
  });
});
