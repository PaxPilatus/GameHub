import { describe, expect, it } from "vitest";

import type {
  GameStateMessage,
  HelloAckMessage,
  PluginLoadedMessage,
} from "@game-hub/protocol";

import {
  createInitialMobileClientState,
  mobileClientReducer,
} from "../src/state.js";

describe("mobile client reducer", () => {
  it("stores hello_ack identity data for reconnect", () => {
    const initialState = createInitialMobileClientState({
      sessionId: "session-1",
    });
    const helloAck: HelloAckMessage = {
      heartbeatIntervalMs: 15_000,
      id: "ack-1",
      phase: "lobby",
      playerId: "player-1",
      playerToken: "token-1",
      reconnect: false,
      role: "moderator",
      sentAt: 1,
      sessionId: "session-1",
      type: "hello_ack",
    };

    const nextState = mobileClientReducer(initialState, {
      type: "hello_ack_received",
      message: helloAck,
    });

    expect(nextState.connectionState).toBe("connected");
    expect(nextState.phase).toBe("lobby");
    expect(nextState.playerId).toBe("player-1");
    expect(nextState.playerToken).toBe("token-1");
    expect(nextState.role).toBe("moderator");
  });

  it("applies host game_state snapshots to lobby state", () => {
    const initialState = {
      ...createInitialMobileClientState({
        playerToken: "token-1",
        sessionId: "session-1",
      }),
      playerId: "player-1",
    };
    const gameState: GameStateMessage = {
      id: "state-1",
      players: [
        {
          playerId: "player-1",
          playerName: "Alice",
        },
      ],
      pluginId: "trivia",
      sentAt: 2,
      state: {
        lifecycle: "game_running",
        moderatorId: "player-1",
        players: [
          {
            connected: true,
            lastSeen: 2,
            name: "Alice",
            playerId: "player-1",
            role: "moderator",
            team: "A",
          },
        ],
        relayStatus: "connected",
        selectedGame: "trivia",
        sessionId: "session-1",
      },
      tick: 7,
      type: "game_state",
    };

    const nextState = mobileClientReducer(initialState, {
      type: "game_state_received",
      message: gameState,
    });

    expect(nextState.phase).toBe("game_running");
    expect(nextState.activeGameId).toBe("trivia");
    expect(nextState.selectedGame).toBe("trivia");
    expect(nextState.players).toHaveLength(1);
    expect(nextState.role).toBe("moderator");
    expect(nextState.relayStatus).toBe("connected");
  });

  it("tracks plugin selection before the running state arrives", () => {
    const initialState = createInitialMobileClientState({
      sessionId: "session-1",
    });
    const pluginLoaded: PluginLoadedMessage = {
      id: "plugin-1",
      pluginId: "snake",
      sentAt: 3,
      type: "plugin_loaded",
      version: "mvp",
    };

    const nextState = mobileClientReducer(initialState, {
      type: "plugin_loaded_received",
      message: pluginLoaded,
    });

    expect(nextState.activeGameId).toBe("snake");
    expect(nextState.selectedGame).toBe("snake");
  });
});
