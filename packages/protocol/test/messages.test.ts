import { describe, expect, it } from "vitest";

import {
  HostStatePayloadSchema,
  HostHelloMessageSchema,
  PROTOCOL_VERSION,
  isHubMessage,
  parseHubMessage,
  safeParseHostStatePayload,
  safeParseHubMessage,
} from "../src/index.js";

describe("HubMessageSchema", () => {
  it("parses a hello message", () => {
    const message = parseHubMessage({
      id: "msg-hello",
      sentAt: 1,
      type: "hello",
      role: "client",
      sessionId: "session-1",
      playerName: "Manuel",
      protocolVersion: PROTOCOL_VERSION,
    });

    expect(message.type).toBe("hello");
    expect(message.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it("normalizes player-facing names", () => {
    const result = safeParseHubMessage({
      clientKind: "mobile",
      id: "msg-mobile",
      name: "  Alice   Smith  ",
      protocolVersion: PROTOCOL_VERSION,
      sentAt: 2,
      sessionId: "session-1",
      type: "hello",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Alice Smith");
    }
  });

  it("rejects overlong player-facing names", () => {
    const result = safeParseHubMessage({
      clientKind: "mobile",
      id: "msg-mobile",
      name: "x".repeat(49),
      protocolVersion: PROTOCOL_VERSION,
      sentAt: 2,
      sessionId: "session-1",
      type: "hello",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a game state payload envelope", () => {
    const result = safeParseHubMessage({
      id: "msg-state",
      sentAt: 2,
      type: "game_state",
      pluginId: "trivia",
      tick: 42,
      players: [
        {
          playerId: "p1",
          playerName: "Alice",
        },
      ],
      state: {
        gameState: {
          questionIndex: 3,
          scores: {
            p1: 10,
          },
        },
        hubState: {
          joinUrl: "https://relay.example/?sessionId=session-1",
          lastRelayMessageAt: 12,
          leaderboard: [],
          lifecycle: "lobby",
          matchStatus: {
            message: null,
            state: "idle",
            title: null,
          },
          moderatorId: "p1",
          overlay: null,
          players: [
            {
              connected: true,
              lastSeen: 12,
              name: "Alice",
              playerId: "p1",
              role: "moderator",
              team: "A",
            },
          ],
          relayStatus: "connected",
          selectedGame: "trivia",
          sessionId: "session-1",
          statusBadges: [],
          updatedAt: 12,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts structured input payloads", () => {
    const result = safeParseHubMessage({
      action: "direction",
      id: "msg-input",
      playerId: "player-1",
      sequence: 7,
      sentAt: 3,
      type: "input",
      value: {
        dir: "left",
        meta: {
          source: "touch",
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("parses host state payload snapshots from the new envelope", () => {
    const result = safeParseHostStatePayload({
      gameState: {
        round: 1,
      },
      hubState: {
        joinUrl: "https://relay.example/?sessionId=session-1",
        lastRelayMessageAt: 10,
        leaderboard: [],
        lifecycle: "lobby",
        matchStatus: {
          message: null,
          state: "idle",
          title: null,
        },
        moderatorId: "player-1",
        overlay: null,
        players: [
          {
            connected: true,
            lastSeen: 10,
            name: "Alice",
            playerId: "player-1",
            role: "moderator",
            team: "A",
          },
        ],
        relayStatus: "connected",
        selectedGame: "trivia",
        sessionId: "session-1",
        statusBadges: [],
        updatedAt: 10,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(HostStatePayloadSchema.parse(result.data).selectedGame).toBe("trivia");
    }
  });

  it("rejects malformed heartbeat messages", () => {
    const result = safeParseHubMessage({
      id: "msg-heartbeat",
      sentAt: "now",
      type: "heartbeat",
    });

    expect(result.success).toBe(false);
  });

  it("parses a host relay handshake", () => {
    const result = HostHelloMessageSchema.safeParse({
      id: "msg-host",
      sentAt: 4,
      type: "hello",
      clientKind: "host",
      sessionId: "session-1",
      token: "secret-1",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown message types", () => {
    expect(
      isHubMessage({
        id: "msg-unknown",
        sentAt: 3,
        type: "not_real",
      }),
    ).toBe(false);
  });
});
