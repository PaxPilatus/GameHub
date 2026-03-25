import { describe, expect, it } from "vitest";

import type { GamePlayerSnapshot } from "@game-hub/sdk";

import {
  createInitialSnakeEngineState,
  createSnakeContext,
  reduceSnakeEngineState,
  type SnakeEngineState,
  type SnakePlayerState,
  type SnakePoint,
  type SnakeState,
} from "../src/reducer.js";

const BASE_PLAYERS: GamePlayerSnapshot[] = [
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
  {
    connected: true,
    lastSeen: 1,
    name: "Dion",
    playerId: "p4",
    role: "player",
    team: "B",
  },
  {
    connected: true,
    lastSeen: 1,
    name: "Eve",
    playerId: "p5",
    role: "player",
    team: "A",
  },
  {
    connected: true,
    lastSeen: 1,
    name: "Finn",
    playerId: "p6",
    role: "player",
    team: "B",
  },
  {
    connected: true,
    lastSeen: 1,
    name: "Gina",
    playerId: "p7",
    role: "player",
    team: "A",
  },
];

describe("snake reducer", () => {
  it("uses dynamic map presets and enters running after countdown", () => {
    const context = createSnakeContext({ tickHz: 12 });
    let state = reduceSnakeEngineState(
      createInitialSnakeEngineState(BASE_PLAYERS.slice(0, 2), context),
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "game_started",
      },
      context,
    );

    expect(state.publicState.stage).toBe("countdown");
    expect(state.publicState.grid.width).toBe(28);
    expect(state.publicState.grid.height).toBe(18);

    state = advanceToRunning(state, BASE_PLAYERS.slice(0, 2), context);

    expect(state.publicState.stage).toBe("running");
    expect(state.publicState.roundSecondsRemaining).toBe(180);
    expect(state.publicState.items.length).toBe(1);
  });

  it("wraps at horizontal border instead of wall death", () => {
    const context = createSnakeContext({ gridHeight: 14, gridWidth: 20, tickHz: 12 });
    let state = createRunningState(BASE_PLAYERS.slice(0, 2), context);
    state = withRunningSnakes(state, [
      createSnake({
        alive: true,
        connected: true,
        direction: "left",
        name: "Alice",
        playerId: "p1",
        score: 0,
        segments: [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
          { x: 2, y: 5 },
          { x: 3, y: 5 },
        ],
        team: "A",
      }),
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Bob",
        playerId: "p2",
        score: 0,
        segments: [
          { x: 10, y: 10 },
          { x: 9, y: 10 },
          { x: 8, y: 10 },
          { x: 7, y: 10 },
        ],
        team: "B",
      }),
    ]);

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    const alice = findSnake(state.publicState, "p1");
    expect(alice.alive).toBe(true);
    expect(alice.head).toEqual({ x: state.publicState.grid.width - 1, y: 5 });
  });

  it("increments score and length by one on food pickup", () => {
    const context = createSnakeContext({ gridHeight: 14, gridWidth: 22, tickHz: 12 });
    let state = createRunningState(BASE_PLAYERS.slice(0, 2), context);

    state = withRunningSnakes(state, [
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Alice",
        playerId: "p1",
        score: 0,
        segments: [
          { x: 4, y: 4 },
          { x: 3, y: 4 },
          { x: 2, y: 4 },
          { x: 1, y: 4 },
        ],
        team: "A",
      }),
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Bob",
        playerId: "p2",
        score: 0,
        segments: [
          { x: 10, y: 10 },
          { x: 9, y: 10 },
          { x: 8, y: 10 },
          { x: 7, y: 10 },
        ],
        team: "B",
      }),
    ]);

    state = {
      ...state,
      publicState: {
        ...state.publicState,
        foods: [{ point: { x: 5, y: 4 }, source: "normal" }],
        items: [],
      },
    };

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    const alice = findSnake(state.publicState, "p1");
    expect(alice.score).toBe(1);
    expect(alice.length).toBe(5);
  });

  it("awards +3 for clear foreign body collision", () => {
    const context = createSnakeContext({ gridHeight: 16, gridWidth: 24, tickHz: 12 });
    let state = createRunningState(BASE_PLAYERS.slice(0, 2), context);

    state = withRunningSnakes(state, [
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Alice",
        playerId: "p1",
        score: 0,
        segments: [
          { x: 11, y: 10 },
          { x: 10, y: 10 },
          { x: 9, y: 10 },
          { x: 8, y: 10 },
        ],
        team: "A",
      }),
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Bob",
        playerId: "p2",
        score: 0,
        segments: [
          { x: 13, y: 10 },
          { x: 12, y: 10 },
          { x: 11, y: 10 },
          { x: 10, y: 10 },
        ],
        team: "B",
      }),
    ]);

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    const alice = findSnake(state.publicState, "p1");
    const bob = findSnake(state.publicState, "p2");

    expect(alice.alive).toBe(false);
    expect(bob.score).toBe(3);
  });

  it("shield blocks first lethal self collision and second collision kills", () => {
    const context = createSnakeContext({ gridHeight: 18, gridWidth: 24, tickHz: 12 });
    let state = createRunningState(BASE_PLAYERS.slice(0, 2), context);

    state = withRunningSnakes(state, [
      createSnake({
        activeEffects: [{ charges: 1, ticksRemaining: 72, type: "shield" }],
        alive: true,
        connected: true,
        direction: "down",
        name: "Alice",
        playerId: "p1",
        score: 0,
        segments: [
          { x: 6, y: 6 },
          { x: 5, y: 6 },
          { x: 5, y: 7 },
          { x: 6, y: 7 },
          { x: 7, y: 7 },
        ],
        team: "A",
      }),
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Bob",
        playerId: "p2",
        score: 0,
        segments: [
          { x: 16, y: 10 },
          { x: 15, y: 10 },
          { x: 14, y: 10 },
          { x: 13, y: 10 },
        ],
        team: "B",
      }),
    ]);

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    let alice = findSnake(state.publicState, "p1");
    expect(alice.alive).toBe(true);
    expect(alice.activeEffects.find((effect) => effect.type === "shield")).toBeUndefined();

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    alice = findSnake(state.publicState, "p1");
    expect(alice.alive).toBe(false);
  });

  it("respawns after 30 ticks with 12 ticks spawn protection", () => {
    const context = createSnakeContext({ gridHeight: 20, gridWidth: 30, tickHz: 12 });
    let state = createRunningState(BASE_PLAYERS.slice(0, 2), context);

    state = withRunningSnakes(state, [
      createSnake({
        alive: false,
        connected: true,
        direction: "right",
        name: "Alice",
        playerId: "p1",
        respawnTicksRemaining: 30,
        score: 0,
        segments: [],
        team: "A",
      }),
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Bob",
        playerId: "p2",
        score: 0,
        segments: [
          { x: 20, y: 10 },
          { x: 19, y: 10 },
          { x: 18, y: 10 },
          { x: 17, y: 10 },
        ],
        team: "B",
      }),
    ]);

    for (let index = 0; index < 30; index += 1) {
      state = reduceSnakeEngineState(
        state,
        {
          players: BASE_PLAYERS.slice(0, 2),
          type: "tick",
        },
        context,
      );
    }

    const alice = findSnake(state.publicState, "p1");
    expect(alice.alive).toBe(true);
    expect(alice.spawnProtectionTicksRemaining).toBe(12);
  });

  it("freezes item settings when running starts", () => {
    const context = createSnakeContext({ tickHz: 12 });
    const players = BASE_PLAYERS.slice(0, 2);
    let state = createInitialSnakeEngineState(players, context);

    state = reduceSnakeEngineState(
      state,
      {
        playerId: "host_local",
        players,
        settings: { boost: false },
        type: "items_config_received",
      },
      context,
    );

    expect(state.publicState.itemSettings.boost).toBe(false);

    state = reduceSnakeEngineState(
      state,
      {
        players,
        type: "game_started",
      },
      context,
    );

    state = advanceToRunning(state, players, context);

    state = reduceSnakeEngineState(
      state,
      {
        playerId: "host_local",
        players,
        settings: { boost: true },
        type: "items_config_received",
      },
      context,
    );

    expect(state.publicState.itemSettings.boost).toBe(false);
  });

  it("freezes secret quest settings when running starts", () => {
    const context = createSnakeContext({ tickHz: 12 });
    const players = BASE_PLAYERS.slice(0, 2);
    let state = createInitialSnakeEngineState(players, context);

    state = reduceSnakeEngineState(
      state,
      {
        enabled: true,
        playerId: "host_local",
        players,
        type: "secret_quests_config_received",
      },
      context,
    );

    expect(state.publicState.secretQuestSettings.enabled).toBe(true);

    state = reduceSnakeEngineState(
      state,
      {
        players,
        type: "game_started",
      },
      context,
    );
    state = advanceToRunning(state, players, context);

    state = reduceSnakeEngineState(
      state,
      {
        enabled: false,
        playerId: "host_local",
        players,
        type: "secret_quests_config_received",
      },
      context,
    );

    expect(state.publicState.secretQuestSettings.enabled).toBe(true);
  });

  it("awards secret quest bonus once and reveals summary at game_over", () => {
    const context = createSnakeContext({ gridHeight: 16, gridWidth: 24, tickHz: 12 });
    let state = createRunningState(BASE_PLAYERS.slice(0, 2), context);

    state = withRunningSnakes(state, [
      createSnake({
        alive: false,
        connected: true,
        direction: "right",
        name: "Alice",
        playerId: "p1",
        score: 1,
        segments: [],
        team: "A",
      }),
      createSnake({
        alive: false,
        connected: true,
        direction: "right",
        name: "Bob",
        playerId: "p2",
        score: 0,
        segments: [],
        team: "B",
      }),
    ]);

    state = {
      ...state,
      publicState: {
        ...state.publicState,
        secretQuestRoundSummary: null,
        secretQuestSettings: { enabled: true },
      },
      roundQuestAssignments: {
        p1: createSecretQuestAssignment("p1", "wrap_4", {
          completed: true,
        }),
      },
      roundQuestMeta: {
        roundCounter: 1,
        waveFirstToThreeByWave: {},
      },
      roundSecretQuestEnabled: true,
      roundTicksRemaining: 1,
    };

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    const alice = findSnake(state.publicState, "p1");
    expect(state.publicState.stage).toBe("game_over");
    expect(alice.score).toBe(9);
    expect(state.publicState.secretQuestRoundSummary).toEqual([
      {
        bonusAwarded: true,
        completed: true,
        playerId: "p1",
        questType: "wrap_4",
      },
    ]);
  });
  it("spawns three items for seven alive players", () => {
    const context = createSnakeContext({ tickHz: 12 });
    const players = BASE_PLAYERS.slice(0, 7);
    let state = createInitialSnakeEngineState(players, context);

    state = reduceSnakeEngineState(
      state,
      {
        players,
        type: "game_started",
      },
      context,
    );

    state = advanceToRunning(state, players, context);

    expect(state.publicState.items.length).toBe(3);
  });

  it("freezes coinrush mode at running start and uses 120 seconds", () => {
    const context = createSnakeContext({ tickHz: 12 });
    const players = BASE_PLAYERS.slice(0, 2);
    let state = createInitialSnakeEngineState(players, context);

    state = reduceSnakeEngineState(
      state,
      {
        mode: "coinrush",
        playerId: "host_local",
        players,
        type: "mode_config_received",
      },
      context,
    );

    expect(state.publicState.roundMode).toBe("coinrush");

    state = reduceSnakeEngineState(
      state,
      {
        players,
        type: "game_started",
      },
      context,
    );

    state = advanceToRunning(state, players, context);

    expect(state.publicState.roundMode).toBe("coinrush");
    expect(state.publicState.roundSecondsRemaining).toBe(120);

    state = reduceSnakeEngineState(
      state,
      {
        mode: "standard",
        playerId: "host_local",
        players,
        type: "mode_config_received",
      },
      context,
    );

    expect(state.publicState.roundMode).toBe("coinrush");
  });

  it("counts normal and gold coin pickups as +1/+3 in coinrush", () => {
    const context = createSnakeContext({ gridHeight: 16, gridWidth: 24, tickHz: 12 });
    let state = createRunningState(BASE_PLAYERS.slice(0, 2), context);

    const seeded = withRunningSnakes(state, [
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Alice",
        playerId: "p1",
        score: 0,
        segments: [
          { x: 4, y: 4 },
          { x: 3, y: 4 },
          { x: 2, y: 4 },
          { x: 1, y: 4 },
        ],
        team: "A",
      }),
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Bob",
        playerId: "p2",
        score: 0,
        segments: [
          { x: 14, y: 10 },
          { x: 13, y: 10 },
          { x: 12, y: 10 },
          { x: 11, y: 10 },
        ],
        team: "B",
      }),
    ]);

    state = {
      ...seeded,
      publicState: {
        ...seeded.publicState,
        coinrush: {
          activeHotspots: [{ x: 5, y: 4 }],
          announcedHotspots: [{ x: 5, y: 4 }],
          phase: "active",
          phaseTicksRemaining: 10,
          wave: 1,
        },
        coins: [
          { point: { x: 5, y: 4 }, type: "normal", value: 1 },
          { point: { x: 6, y: 4 }, type: "gold", value: 3 },
        ],
        roundMode: "coinrush",
      },
      roundModeFrozen: "coinrush",
    };

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    const alice = findSnake(state.publicState, "p1");
    expect(alice.coinCount).toBe(4);
  });

  it("resolves coinrush winner by coinCount instead of score", () => {
    const context = createSnakeContext({ gridHeight: 16, gridWidth: 24, tickHz: 12 });
    let state = createRunningState(BASE_PLAYERS.slice(0, 2), context);

    state = withRunningSnakes(state, [
      createSnake({
        alive: true,
        coinCount: 1,
        connected: true,
        direction: "right",
        name: "Alice",
        playerId: "p1",
        score: 20,
        segments: [
          { x: 4, y: 4 },
          { x: 3, y: 4 },
          { x: 2, y: 4 },
          { x: 1, y: 4 },
        ],
        team: "A",
      }),
      createSnake({
        alive: true,
        coinCount: 4,
        connected: true,
        direction: "left",
        name: "Bob",
        playerId: "p2",
        score: 0,
        segments: [
          { x: 18, y: 10 },
          { x: 19, y: 10 },
          { x: 20, y: 10 },
          { x: 21, y: 10 },
        ],
        team: "B",
      }),
    ]);

    state = {
      ...state,
      publicState: {
        ...state.publicState,
        coinrush: {
          activeHotspots: [],
          announcedHotspots: [],
          phase: "announce",
          phaseTicksRemaining: 5,
          wave: 2,
        },
        roundMode: "coinrush",
      },
      roundModeFrozen: "coinrush",
      roundTicksRemaining: 1,
    };

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    expect(state.publicState.stage).toBe("game_over");
    expect(state.publicState.winnerPlayerId).toBe("p2");
    expect(state.publicState.latestMessage).toContain("Coinrush");
  });


  it("distributes initial food across multiple rows at round start", () => {
    const context = createSnakeContext({ tickHz: 12 });
    const players = BASE_PLAYERS.slice(0, 2);
    let state = createInitialSnakeEngineState(players, context);

    state = reduceSnakeEngineState(
      state,
      {
        players,
        type: "game_started",
      },
      context,
    );

    state = advanceToRunning(state, players, context);

    const sample = state.publicState.foods.slice(0, 10);
    expect(sample.length).toBeGreaterThanOrEqual(8);
    expect(new Set(sample.map((food) => food.point.y)).size).toBeGreaterThan(1);
    expect(new Set(sample.map((food) => food.point.x)).size).toBeGreaterThan(3);
  });

  it("resets remaining coins when coinrush wave transitions active -> announce", () => {
    const context = createSnakeContext({ gridHeight: 16, gridWidth: 24, tickHz: 12 });
    let state = createRunningState(BASE_PLAYERS.slice(0, 2), context);

    state = withRunningSnakes(state, [
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Alice",
        playerId: "p1",
        score: 0,
        segments: [
          { x: 4, y: 4 },
          { x: 3, y: 4 },
          { x: 2, y: 4 },
          { x: 1, y: 4 },
        ],
        team: "A",
      }),
      createSnake({
        alive: true,
        connected: true,
        direction: "left",
        name: "Bob",
        playerId: "p2",
        score: 0,
        segments: [
          { x: 18, y: 10 },
          { x: 19, y: 10 },
          { x: 20, y: 10 },
          { x: 21, y: 10 },
        ],
        team: "B",
      }),
    ]);

    state = {
      ...state,
      publicState: {
        ...state.publicState,
        coinrush: {
          activeHotspots: [{ x: 12, y: 8 }],
          announcedHotspots: [],
          phase: "active",
          phaseTicksRemaining: 1,
          wave: 2,
        },
        coins: [{ point: { x: 22, y: 15 }, type: "normal", value: 1 }],
        roundMode: "coinrush",
      },
      roundModeFrozen: "coinrush",
    };

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    expect(state.publicState.coinrush?.phase).toBe("announce");
    expect(state.publicState.coins).toHaveLength(0);
  });

  it("does not count first_3_wave_coins progress during announcement phase", () => {
    const context = createSnakeContext({ gridHeight: 16, gridWidth: 24, tickHz: 12 });
    let state = createRunningState(BASE_PLAYERS.slice(0, 2), context);

    state = withRunningSnakes(state, [
      createSnake({
        alive: true,
        connected: true,
        direction: "right",
        name: "Alice",
        playerId: "p1",
        score: 0,
        segments: [
          { x: 4, y: 4 },
          { x: 3, y: 4 },
          { x: 2, y: 4 },
          { x: 1, y: 4 },
        ],
        team: "A",
      }),
      createSnake({
        alive: true,
        connected: true,
        direction: "left",
        name: "Bob",
        playerId: "p2",
        score: 0,
        segments: [
          { x: 18, y: 10 },
          { x: 19, y: 10 },
          { x: 20, y: 10 },
          { x: 21, y: 10 },
        ],
        team: "B",
      }),
    ]);

    state = {
      ...state,
      publicState: {
        ...state.publicState,
        coinrush: {
          activeHotspots: [],
          announcedHotspots: [{ x: 6, y: 4 }],
          phase: "announce",
          phaseTicksRemaining: 8,
          wave: 3,
        },
        coins: [{ point: { x: 5, y: 4 }, type: "normal", value: 1 }],
        roundMode: "coinrush",
      },
      roundModeFrozen: "coinrush",
      roundQuestAssignments: {
        p1: createSecretQuestAssignment("p1", "first_3_wave_coins"),
      },
      roundQuestMeta: {
        roundCounter: 1,
        waveFirstToThreeByWave: {},
      },
      roundSecretQuestEnabled: true,
    };

    state = reduceSnakeEngineState(
      state,
      {
        players: BASE_PLAYERS.slice(0, 2),
        type: "tick",
      },
      context,
    );

    const assignment = state.roundQuestAssignments.p1;
    expect(assignment?.completed).toBe(false);
    expect(assignment?.progress.waveCoinCount).toBe(0);
    expect(assignment?.progress.waveTarget).toBeNull();
  });

  it("assigns secret quests only to connected round participants", () => {
    const context = createSnakeContext({ tickHz: 12 });
    const players = [
      BASE_PLAYERS[0],
      BASE_PLAYERS[1],
      {
        ...BASE_PLAYERS[2],
        connected: false,
      },
    ];

    let state = createInitialSnakeEngineState(players, context);

    state = reduceSnakeEngineState(
      state,
      {
        enabled: true,
        playerId: "host_local",
        players,
        type: "secret_quests_config_received",
      },
      context,
    );

    state = reduceSnakeEngineState(
      state,
      {
        players,
        type: "game_started",
      },
      context,
    );

    state = advanceToRunning(state, players, context);

    expect(Object.keys(state.roundQuestAssignments).sort()).toEqual(["p1", "p2"]);
  });

});

function createRunningState(
  players: GamePlayerSnapshot[],
  context: ReturnType<typeof createSnakeContext>,
): SnakeEngineState {
  const started = reduceSnakeEngineState(
    createInitialSnakeEngineState(players, context),
    {
      players,
      type: "game_started",
    },
    context,
  );

  return advanceToRunning(started, players, context);
}

function advanceToRunning(
  inputState: SnakeEngineState,
  players: GamePlayerSnapshot[],
  context: ReturnType<typeof createSnakeContext>,
): SnakeEngineState {
  let state = inputState;
  for (let index = 0; index < 80; index += 1) {
    if (state.publicState.stage === "running") {
      return state;
    }
    state = reduceSnakeEngineState(
      state,
      {
        players,
        type: "tick",
      },
      context,
    );
  }
  throw new Error("State did not reach running stage within expected ticks.");
}

function withRunningSnakes(
  state: SnakeEngineState,
  snakes: SnakePlayerState[],
): SnakeEngineState {
  return {
    ...state,
    publicState: {
      ...state.publicState,
      aliveCount: snakes.filter((snake) => snake.alive).length,
      foods: [],
      items: [],
      snakes,
      stage: "running",
    },
    roundTicksRemaining: 400,
  };
}

function createSnake(partial: {
  activeEffects?: SnakePlayerState["activeEffects"];
  alive: boolean;
  coinCount?: number;
  connected: boolean;
  direction: SnakePlayerState["direction"];
  name: string;
  playerId: string;
  respawnTicksRemaining?: number | null;
  score: number;
  segments: SnakePoint[];
  team: SnakePlayerState["team"];
}): SnakePlayerState {
  return {
    activeEffects: partial.activeEffects ?? [],
    alive: partial.alive,
    coinCount: partial.coinCount ?? 0,
    color: partial.playerId === "p1" ? "#0f8b8d" : "#f4a259",
    connected: partial.connected,
    direction: partial.direction,
    head: partial.segments[0] ?? null,
    length: partial.segments.length,
    name: partial.name,
    playerId: partial.playerId,
    respawnTicksRemaining: partial.respawnTicksRemaining ?? null,
    score: partial.score,
    segments: partial.segments,
    spawnProtectionTicksRemaining: 0,
    speedBank: 0,
    team: partial.team,
    wins: 0,
  };
}

function createSecretQuestAssignment(
  playerId: string,
  questType: SnakeEngineState["roundQuestAssignments"][string]["questType"],
  overrides?: {
    bonusAwarded?: boolean;
    completed?: boolean;
    progress?: Partial<SnakeEngineState["roundQuestAssignments"][string]["progress"]>;
  },
): SnakeEngineState["roundQuestAssignments"][string] {
  const baseProgress: SnakeEngineState["roundQuestAssignments"][string]["progress"] = {
    boostWindowFoodCount: 0,
    boostWindowTicksRemaining: 0,
    dropFoodCollected: 0,
    foodCollectedInWindow: 0,
    foodCollectedSinceDeath: 0,
    foodWindowTicksRemaining: 0,
    killCount: 0,
    noItemSurvivalTicks: 0,
    overtakeCount: 0,
    overtakenOpponents: [],
    waveCoinCount: 0,
    waveTarget: null,
    wraps: 0,
  };

  return {
    bonusAwarded: overrides?.bonusAwarded ?? false,
    completed: overrides?.completed ?? false,
    playerId,
    progress: {
      ...baseProgress,
      ...(overrides?.progress ?? {}),
      overtakenOpponents:
        overrides?.progress?.overtakenOpponents !== undefined
          ? [...overrides.progress.overtakenOpponents]
          : baseProgress.overtakenOpponents,
    },
    questType,
  };
}

function findSnake(state: SnakeState, playerId: string): SnakePlayerState {
  const snake = state.snakes.find((candidate) => candidate.playerId === playerId);
  if (snake === undefined) {
    throw new Error(`Missing snake for ${playerId}`);
  }
  return snake;
}










