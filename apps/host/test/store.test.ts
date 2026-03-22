import { describe, expect, it } from "vitest";

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
      token: "token-1",
    });

    const second = store.upsertPlayer({
      connected: true,
      lastSeen: 3,
      name: "Bob",
      playerId: "p2",
      reconnect: false,
      token: "token-2",
    });

    expect(first.moderatorId).toBe("p1");
    expect(second.players.map((player) => player.team)).toEqual(["A", "B"]);
  });

  it("transitions into game_finished after stopping a running game", () => {
    const store = new HostSessionStore(1);
    store.resetSession({
      joinUrl: "http://localhost:8787/?sessionId=session-1",
      now: 1,
      sessionId: "session-1",
    });
    store.setLifecycle("lobby", 2);
    store.setSelectedGame("trivia", 3);
    store.setLifecycle("game_running", 4);

    const snapshot = store.setLifecycle("game_finished", 5);

    expect(snapshot.lifecycle).toBe("game_finished");
    expect(snapshot.selectedGame).toBe("trivia");
  });
});
