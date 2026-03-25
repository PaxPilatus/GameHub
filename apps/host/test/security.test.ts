import { describe, expect, it } from "vitest";

import {
  sanitizeDiagnosticEvent,
  sanitizeHostSnapshot,
  sanitizeStructuredData,
} from "../src/security.js";

describe("host security helpers", () => {
  it("redacts nested token and secret fields", () => {
    expect(
      sanitizeStructuredData({
        authToken: "abc",
        nested: {
          hostSecret: "secret-1",
          safe: "visible",
        },
      }),
    ).toEqual({
      authToken: "[redacted]",
      nested: {
        hostSecret: "[redacted]",
        safe: "visible",
      },
    });
  });

  it("sanitizes diagnostic payloads before renderer delivery", () => {
    const event = sanitizeDiagnosticEvent({
      data: {
        joinUrl: "https://relay.example/?sessionId=session-1",
        playerToken: "token-1",
      },
      id: "diag-1",
      level: "warn",
      message: "Test",
      timestamp: 1,
      type: "relay_error",
    });

    expect(event.data).toEqual({
      joinUrl: "https://relay.example/?sessionId=session-1",
      playerToken: "[redacted]",
    });
  });

  it("sanitizes nested game state before snapshots reach the renderer", () => {
    const snapshot = sanitizeHostSnapshot({
      gameState: {
        authToken: "token-1",
        nested: {
          reconnectSecret: "secret-1",
        },
      },
      joinUrl: "https://relay.example/?sessionId=session-1",
      lastRelayMessageAt: null,
      leaderboard: [],
      lifecycle: "lobby",
      matchStatus: {
        message: null,
        state: "idle",
        title: null,
      },
      moderatorId: null,
      overlay: null,
      players: [],
      relayStatus: "connected",
      selectedGame: "snake",
      sessionId: "session-1",
      statusBadges: [],
      updatedAt: 1,
    });

    expect(snapshot.gameState).toEqual({
      authToken: "[redacted]",
      nested: {
        reconnectSecret: "[redacted]",
      },
    });
  });
});
