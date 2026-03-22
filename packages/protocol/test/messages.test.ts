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

  it("accepts a game state payload", () => {
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
        questionIndex: 3,
        scores: {
          p1: 10,
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

  it("parses host state payload snapshots", () => {
    const result = safeParseHostStatePayload({
      lifecycle: "lobby",
      moderatorId: "player-1",
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