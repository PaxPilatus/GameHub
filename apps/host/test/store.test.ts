import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DiagnosticEventCard,
  JoinUrlBlock,
} from "../renderer/src/App.tsx";
import { buildCentralLeaderboard } from "../renderer/src/central-leaderboard.js";
import { HostSessionStore } from "../src/store.js";

describe("HostSessionStore", () => {
  it("assigns moderator and teams when players join", () => {
    const store = new HostSessionStore(1);
    store.resetSession({
      joinUrl: "http://localhost:8787/?sessionId=session-1",
      now: 1,
      sessionId: "session-1",
    });

    const first = store.upsertPlayer({
      connected: true,
      lastSeen: 2,
      name: "Alice",
      playerId: "p1",
      reconnect: false,
    });

    const second = store.upsertPlayer({
      connected: true,
      lastSeen: 3,
      name: "Bob",
      playerId: "p2",
      reconnect: false,
    });

    expect(first.moderatorId).toBe("p1");
    expect(second.players.map((player) => player.team)).toEqual(["A", "B"]);
    expect(second.leaderboard.map((entry) => entry.playerId)).toEqual(["p1", "p2"]);
    expect(
      Object.prototype.hasOwnProperty.call(second.players[0] ?? {}, "token"),
    ).toBe(false);
  });

  it("clears the previous game state when selecting a different game", () => {
    const store = new HostSessionStore(1);
    store.resetSession({
      joinUrl: "http://localhost:8787/?sessionId=session-1",
      now: 1,
      sessionId: "session-1",
    });
    store.setGameState({ stage: "running" }, 2);

    const snapshot = store.setSelectedGame("trivia", 3);

    expect(snapshot.selectedGame).toBe("trivia");
    expect(snapshot.gameState).toBeNull();
    expect(snapshot.matchStatus.state).toBe("idle");
  });

  it("applies leaderboard result events", () => {
    const store = new HostSessionStore(1);
    store.resetSession({
      joinUrl: "http://localhost:8787/?sessionId=session-1",
      now: 1,
      sessionId: "session-1",
    });
    store.upsertPlayer({
      connected: true,
      lastSeen: 2,
      name: "Alice",
      playerId: "p1",
      reconnect: false,
    });
    store.upsertPlayer({
      connected: true,
      lastSeen: 3,
      name: "Bob",
      playerId: "p2",
      reconnect: false,
    });

    store.applyResultEvent({ playerId: "p2", type: "record_player_win" }, 4);
    store.applyResultEvent({ playerId: "p1", points: 200, type: "set_player_score" }, 5);
    store.applyResultEvent({ playerId: "p2", status: "alive", type: "set_player_status" }, 6);

    const snapshot = store.getSnapshot();
    expect(snapshot.leaderboard).toEqual([
      expect.objectContaining({ playerId: "p2", status: "alive", wins: 1 }),
      expect.objectContaining({ playerId: "p1", score: 200 }),
    ]);
  });
});

describe("buildCentralLeaderboard", () => {
  it("prefers placement, then wins, then score, then team", () => {
    const leaderboard = buildCentralLeaderboard({
      leaderboard: [
        {
          connected: true,
          name: "Bob",
          placement: null,
          playerId: "p2",
          role: "player",
          score: 0,
          status: "alive",
          team: "B",
          teamScore: 0,
          wins: 3,
        },
        {
          connected: true,
          name: "Alice",
          placement: null,
          playerId: "p1",
          role: "moderator",
          score: 120,
          status: "connected",
          team: "A",
          teamScore: 120,
          wins: 0,
        },
      ],
    });

    expect(leaderboard).toEqual([
      {
        metricLabel: "wins",
        metricValue: "3",
        name: "Bob",
        playerId: "p2",
        status: "alive",
      },
      {
        metricLabel: "wins",
        metricValue: "0",
        name: "Alice",
        playerId: "p1",
        status: "connected",
      },
    ]);
  });

  it("falls back to team details when no ranking metric is available", () => {
    const leaderboard = buildCentralLeaderboard({
      leaderboard: [
        {
          connected: true,
          name: "Alice",
          placement: null,
          playerId: "p1",
          role: "moderator",
          score: 0,
          status: null,
          team: "A",
          teamScore: 0,
          wins: 0,
        },
      ],
    });

    expect(leaderboard).toEqual([
      {
        metricLabel: "team",
        metricValue: "A",
        name: "Alice",
        playerId: "p1",
        status: "connected",
      },
    ]);
  });
});

describe("host admin renderer helpers", () => {
  it("renders an active copy button when a join URL exists", () => {
    const html = renderToStaticMarkup(
      React.createElement(JoinUrlBlock, {
        copyStatus: "idle",
        joinUrl: "https://relay.example/?sessionId=session-1",
        onCopy: () => undefined,
      }),
    );

    expect(html).toContain("Copy URL");
    expect(html).toContain("https://relay.example/?sessionId=session-1");
    expect(html).not.toContain('disabled=""');
  });

  it("renders diagnostics collapsed with severity styling", () => {
    const html = renderToStaticMarkup(
      React.createElement(DiagnosticEventCard, {
        event: {
          data: { code: "rate_limited", retryInMs: 1000 },
          id: "diag-1",
          level: "warn",
          message: "Rate limit exceeded.",
          timestamp: 1,
          type: "relay_error",
        },
      }),
    );

    expect(html).toContain("<details");
    expect(html).toContain("diag diag-warn");
    expect(html).toContain("relay_error");
    expect(html).toContain("Rate limit exceeded.");
    expect(html).not.toContain("<details open");
  });
});
