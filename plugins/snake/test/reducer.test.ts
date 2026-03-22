import { describe, expect, it } from "vitest";

import type { GamePlayerSnapshot } from "@game-hub/sdk";

import {
  createInitialSnakeEngineState,
  createSnakeContext,
  reduceSnakeEngineState,
  type SnakeDirection,
  type SnakeEngineState,
} from "../src/reducer.js";

const TEST_PLAYERS: GamePlayerSnapshot[] = [
  {
    connected: true,
    lastSeen: 1,
    name: "Alice",
    playerId: "p1",
    role: "moderator",
    team: "A",
  },
  {
    connected: true,
    lastSeen: 1,
    name: "Bob",
    playerId: "p2",
    role: "player",
    team: "B",
  },
  {
    connected: true,
    lastSeen: 1,
    name: "Cara",
    playerId: "p3",
    role: "player",
    team: "A",
  },
];

describe("snake reducer", () => {
  it("applies the last queued direction on the next tick", () => {
    const context = createSnakeContext({
      gridHeight: 12,
      gridWidth: 20,
      tickHz: 12,
    });
    let state = reduceSnakeEngineState(
      createInitialSnakeEngineState(TEST_PLAYERS.slice(0, 2), context),
      {
        players: TEST_PLAYERS.slice(0, 2),
        type: "game_started",
      },
      context,
    );
    const aliceBeforeTick = state.publicState.snakes.find((snake) => snake.playerId === "p1");

    expect(aliceBeforeTick?.alive).toBe(true);

    const queuedDirections = chooseQueuedDirections(aliceBeforeTick?.direction ?? "right");
    state = reduceSnakeEngineState(
      state,
      {
        dir: queuedDirections[0],
        playerId: "p1",
        players: TEST_PLAYERS.slice(0, 2),
        type: "direction_received",
      },
      context,
    );
    state = reduceSnakeEngineState(
      state,
      {
        dir: queuedDirections[1],
        playerId: "p1",
        players: TEST_PLAYERS.slice(0, 2),
        type: "direction_received",
      },
      context,
    );
    state = reduceSnakeEngineState(
      state,
      {
        players: TEST_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    const aliceAfterTick = state.publicState.snakes.find((snake) => snake.playerId === "p1");

    expect(aliceAfterTick?.direction).toBe(queuedDirections[1]);
    expect(aliceAfterTick?.head).toEqual(
      movePoint(aliceBeforeTick?.head ?? { x: 0, y: 0 }, queuedDirections[1]),
    );
  });

  it("resolves wall collisions and ends the round when one snake remains", () => {
    const context = createSnakeContext({
      gridHeight: 8,
      gridWidth: 12,
      tickHz: 12,
    });
    const state = createWallCollisionState(context);
    const nextState = reduceSnakeEngineState(
      state,
      {
        players: TEST_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    const alice = nextState.publicState.snakes.find((snake) => snake.playerId === "p1");
    const bob = nextState.publicState.snakes.find((snake) => snake.playerId === "p2");

    expect(alice?.alive).toBe(false);
    expect(nextState.publicState.stage).toBe("game_over");
    expect(nextState.publicState.winnerPlayerId).toBe("p2");
    expect(bob?.wins).toBe(1);
  });

  it("respawns a reconnecting player during a running round", () => {
    const context = createSnakeContext({
      gridHeight: 14,
      gridWidth: 22,
      tickHz: 12,
    });
    let state = reduceSnakeEngineState(
      createInitialSnakeEngineState(TEST_PLAYERS, context),
      {
        players: TEST_PLAYERS,
        type: "game_started",
      },
      context,
    );

    state = reduceSnakeEngineState(
      state,
      {
        players: TEST_PLAYERS.map((player) =>
          player.playerId === "p1"
            ? {
                ...player,
                connected: false,
              }
            : player,
        ),
        type: "session_synced",
      },
      context,
    );

    const disconnectedAlice = state.publicState.snakes.find((snake) => snake.playerId === "p1");
    expect(disconnectedAlice?.alive).toBe(false);
    expect(state.publicState.stage).toBe("running");

    state = reduceSnakeEngineState(
      state,
      {
        playerId: "p1",
        players: TEST_PLAYERS,
        type: "player_reconnected",
      },
      context,
    );

    const reconnectedAlice = state.publicState.snakes.find((snake) => snake.playerId === "p1");

    expect(reconnectedAlice?.alive).toBe(true);
    expect(reconnectedAlice?.segments.length).toBe(4);
    expect(state.publicState.aliveCount).toBe(3);
  });
});

function chooseQueuedDirections(direction: SnakeDirection): [SnakeDirection, SnakeDirection] {
  switch (direction) {
    case "up":
    case "down":
      return ["left", "right"];
    case "left":
    case "right":
      return ["up", "down"];
    default:
      return ["up", "down"];
  }
}

function createWallCollisionState(context: ReturnType<typeof createSnakeContext>): SnakeEngineState {
  const base = createInitialSnakeEngineState(TEST_PLAYERS.slice(0, 2), context);

  return {
    pendingDirections: {},
    publicState: {
      ...base.publicState,
      aliveCount: 2,
      latestMessage: "Collision test",
      snakes: [
        {
          alive: true,
          color: "#0f8b8d",
          connected: true,
          direction: "left",
          head: { x: 0, y: 2 },
          length: 4,
          name: "Alice",
          playerId: "p1",
          segments: [
            { x: 0, y: 2 },
            { x: 1, y: 2 },
            { x: 2, y: 2 },
            { x: 3, y: 2 },
          ],
          team: "A",
          wins: 0,
        },
        {
          alive: true,
          color: "#f4a259",
          connected: true,
          direction: "right",
          head: { x: 4, y: 5 },
          length: 4,
          name: "Bob",
          playerId: "p2",
          segments: [
            { x: 4, y: 5 },
            { x: 3, y: 5 },
            { x: 2, y: 5 },
            { x: 1, y: 5 },
          ],
          team: "B",
          wins: 0,
        },
      ],
      stage: "running",
      tick: 4,
      winnerPlayerId: null,
      winnerTeam: null,
    },
  };
}

function movePoint(
  point: { x: number; y: number },
  direction: SnakeDirection,
): { x: number; y: number } {
  switch (direction) {
    case "up":
      return { x: point.x, y: point.y - 1 };
    case "down":
      return { x: point.x, y: point.y + 1 };
    case "left":
      return { x: point.x - 1, y: point.y };
    case "right":
      return { x: point.x + 1, y: point.y };
    default:
      return point;
  }
}
