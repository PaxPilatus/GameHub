import type { PlayerTeam } from "@game-hub/protocol";
import type { GamePlayerSnapshot } from "@game-hub/sdk";

export const SNAKE_DIRECTION_ACTION = "direction";
export const SNAKE_EFFECT_ACTION = "action";
export const SNAKE_RESTART_ACTION = "restart";
export const SNAKE_DEFAULT_TICK_HZ = 12;
export const SNAKE_DEFAULT_GRID_WIDTH = 40;
export const SNAKE_DEFAULT_GRID_HEIGHT = 24;
export const SNAKE_INITIAL_LENGTH = 4;

const SNAKE_COLORS = [
  "#0f8b8d",
  "#f4a259",
  "#bc4b51",
  "#4d9078",
  "#8d6a9f",
  "#577590",
  "#f28482",
  "#7c9c3c",
] as const;

const DEFAULT_DIRECTIONS: SnakeDirection[] = ["right", "left", "down", "up"];

export type SnakeStage = "lobby" | "running" | "game_over";
export type SnakeDirection = "up" | "down" | "left" | "right";

export interface SnakePoint {
  x: number;
  y: number;
}

export interface SnakePlayerState {
  alive: boolean;
  color: string;
  connected: boolean;
  direction: SnakeDirection;
  head: SnakePoint | null;
  length: number;
  name: string;
  playerId: string;
  segments: SnakePoint[];
  team: PlayerTeam;
  wins: number;
}

export interface SnakeState extends Record<string, unknown> {
  aliveCount: number;
  grid: {
    height: number;
    width: number;
  };
  latestMessage: string;
  snakes: SnakePlayerState[];
  stage: SnakeStage;
  tick: number;
  tickHz: number;
  winnerPlayerId: string | null;
  winnerTeam: PlayerTeam | null;
}

export interface SnakeEngineState {
  pendingDirections: Record<string, SnakeDirection>;
  publicState: SnakeState;
}

export interface SnakeContext {
  gridHeight: number;
  gridWidth: number;
  initialLength: number;
  tickHz: number;
}

export type SnakeEvent =
  | {
      players: GamePlayerSnapshot[];
      type: "direction_received";
      dir: SnakeDirection;
      playerId: string;
    }
  | {
      players: GamePlayerSnapshot[];
      type: "game_started";
    }
  | {
      players: GamePlayerSnapshot[];
      type: "game_stopped";
    }
  | {
      players: GamePlayerSnapshot[];
      type: "player_reconnected";
      playerId: string;
    }
  | {
      players: GamePlayerSnapshot[];
      type: "restart_requested";
    }
  | {
      players: GamePlayerSnapshot[];
      type: "session_synced";
    }
  | {
      players: GamePlayerSnapshot[];
      type: "tick";
    };

interface SpawnCandidate {
  direction: SnakeDirection;
  segments: SnakePoint[];
}

export function createSnakeContext(
  options: Partial<SnakeContext> = {},
): SnakeContext {
  return {
    gridHeight: options.gridHeight ?? SNAKE_DEFAULT_GRID_HEIGHT,
    gridWidth: options.gridWidth ?? SNAKE_DEFAULT_GRID_WIDTH,
    initialLength: options.initialLength ?? SNAKE_INITIAL_LENGTH,
    tickHz: options.tickHz ?? SNAKE_DEFAULT_TICK_HZ,
  };
}

export function createInitialSnakeEngineState(
  players: GamePlayerSnapshot[],
  context: SnakeContext,
): SnakeEngineState {
  const snakes = mapPlayersToSnakeState([], players);

  return {
    pendingDirections: {},
    publicState: {
      aliveCount: 0,
      grid: {
        height: context.gridHeight,
        width: context.gridWidth,
      },
      latestMessage: buildLobbyMessage(players),
      snakes,
      stage: "lobby",
      tick: 0,
      tickHz: context.tickHz,
      winnerPlayerId: null,
      winnerTeam: null,
    },
  };
}

export function reduceSnakeEngineState(
  state: SnakeEngineState,
  event: SnakeEvent,
  context: SnakeContext,
): SnakeEngineState {
  switch (event.type) {
    case "game_started":
      return startRound(syncPlayers(state, event.players), context);
    case "restart_requested":
      return startRound(syncPlayers(state, event.players), context);
    case "game_stopped":
      return stopRound(syncPlayers(state, event.players), event.players);
    case "session_synced":
      return finalizeIfNeeded(syncPlayers(state, event.players));
    case "direction_received":
      return queueDirection(state, event);
    case "player_reconnected":
      return respawnPlayer(state, event.playerId, event.players, context);
    case "tick":
      return advanceTick(state, event.players, context);
    default:
      return state;
  }
}

function advanceTick(
  state: SnakeEngineState,
  players: GamePlayerSnapshot[],
  context: SnakeContext,
): SnakeEngineState {
  const synced = syncPlayers(state, players);

  if (synced.publicState.stage !== "running") {
    return synced;
  }

  if (synced.publicState.aliveCount <= 1) {
    return finalizeIfNeeded(synced);
  }

  const projectedSnakes = synced.publicState.snakes.map((snake) =>
    projectSnakeMovement(
      snake,
      synced.pendingDirections[snake.playerId],
      context.initialLength,
    ),
  );
  const occupancy = buildOccupancy(projectedSnakes);
  const resolvedSnakes = projectedSnakes.map((snake) => {
    if (!snake.connected || !snake.alive) {
      return snake;
    }

    const head = snake.segments[0];

    if (
      head === undefined ||
      !isInsideGrid(head, context) ||
      (occupancy.get(pointKey(head)) ?? 0) > 1
    ) {
      return clearSnake(snake);
    }

    return {
      ...snake,
      head: clonePoint(head),
      segments: cloneSegments(snake.segments),
    };
  });

  return finalizeIfNeeded({
    pendingDirections: {},
    publicState: {
      ...synced.publicState,
      aliveCount: countAlive(resolvedSnakes),
      latestMessage: buildRunningMessage(countAlive(resolvedSnakes)),
      snakes: resolvedSnakes,
      tick: synced.publicState.tick + 1,
    },
  });
}

function buildLobbyMessage(players: GamePlayerSnapshot[]): string {
  const connectedPlayers = players.filter((player) => player.connected).length;
  return connectedPlayers === 0
    ? "Waiting for players to join the lobby."
    : `${connectedPlayers} player${connectedPlayers === 1 ? "" : "s"} ready for Snake.`;
}

function buildOccupancy(snakes: SnakePlayerState[]): Map<string, number> {
  const occupancy = new Map<string, number>();

  for (const snake of snakes) {
    if (!snake.alive) {
      continue;
    }

    for (const segment of snake.segments) {
      const key = pointKey(segment);
      occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
    }
  }

  return occupancy;
}

function buildRunningMessage(aliveCount: number): string {
  if (aliveCount <= 1) {
    return "Round resolving.";
  }

  return `${aliveCount} snakes alive.`;
}

function clearSnake(snake: SnakePlayerState): SnakePlayerState {
  return {
    ...snake,
    alive: false,
    head: null,
    segments: [],
  };
}

function clonePoint(point: SnakePoint): SnakePoint {
  return { ...point };
}

function cloneSegments(segments: SnakePoint[]): SnakePoint[] {
  return segments.map((segment) => clonePoint(segment));
}

function countAlive(snakes: SnakePlayerState[]): number {
  return snakes.filter((snake) => snake.alive).length;
}

function createSpawnCandidates(context: SnakeContext): SpawnCandidate[] {
  const candidates: SpawnCandidate[] = [];

  for (let y = 3; y <= context.gridHeight - 4; y += 4) {
    candidates.push(createSpawnCandidate(4, y, "right", context.initialLength));
    candidates.push(
      createSpawnCandidate(
        context.gridWidth - 5,
        y,
        "left",
        context.initialLength,
      ),
    );
  }

  for (let x = 4; x <= context.gridWidth - 5; x += 6) {
    candidates.push(createSpawnCandidate(x, 4, "down", context.initialLength));
    candidates.push(
      createSpawnCandidate(
        x,
        context.gridHeight - 5,
        "up",
        context.initialLength,
      ),
    );
  }

  return candidates;
}

function createSpawnCandidate(
  headX: number,
  headY: number,
  direction: SnakeDirection,
  length: number,
): SpawnCandidate {
  const movement = directionVector(direction);
  const tailVector = {
    x: movement.x * -1,
    y: movement.y * -1,
  };
  const segments: SnakePoint[] = [];

  for (let index = 0; index < length; index += 1) {
    segments.push({
      x: headX + tailVector.x * index,
      y: headY + tailVector.y * index,
    });
  }

  return {
    direction,
    segments,
  };
}

function createSpectatorSnake(
  player: GamePlayerSnapshot,
  index: number,
  previous?: SnakePlayerState,
): SnakePlayerState {
  const direction = previous?.direction ?? DEFAULT_DIRECTIONS[index % DEFAULT_DIRECTIONS.length] ?? "right";

  return {
    alive: false,
    color: previous?.color ?? SNAKE_COLORS[index % SNAKE_COLORS.length] ?? SNAKE_COLORS[0],
    connected: player.connected,
    direction,
    head: null,
    length: previous?.length ?? SNAKE_INITIAL_LENGTH,
    name: player.name,
    playerId: player.playerId,
    segments: [],
    team: player.team,
    wins: previous?.wins ?? 0,
  };
}

function directionVector(direction: SnakeDirection): SnakePoint {
  switch (direction) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    default:
      return { x: 1, y: 0 };
  }
}

function finalizeIfNeeded(state: SnakeEngineState): SnakeEngineState {
  if (state.publicState.stage !== "running") {
    return state;
  }

  const livingSnakes = state.publicState.snakes.filter((snake) => snake.alive);

  if (livingSnakes.length > 1) {
    return state;
  }

  const winner = livingSnakes[0] ?? null;
  const snakesWithScore = state.publicState.snakes.map((snake) => {
    if (winner !== null && snake.playerId === winner.playerId) {
      return {
        ...snake,
        wins: snake.wins + 1,
      };
    }

    return snake;
  });

  return {
    pendingDirections: {},
    publicState: {
      ...state.publicState,
      aliveCount: livingSnakes.length,
      latestMessage:
        winner === null
          ? "All snakes were eliminated. Draw."
          : `${winner.name} wins the round.`,
      snakes: snakesWithScore,
      stage: "game_over",
      winnerPlayerId: winner?.playerId ?? null,
      winnerTeam: winner?.team ?? null,
    },
  };
}

function findSafeSpawn(
  snakes: SnakePlayerState[],
  playerId: string,
  context: SnakeContext,
): SpawnCandidate | null {
  const occupancy = new Set<string>();

  for (const snake of snakes) {
    if (!snake.alive || snake.playerId === playerId) {
      continue;
    }

    for (const segment of snake.segments) {
      occupancy.add(pointKey(segment));
    }
  }

  const candidates = createSpawnCandidates(context);
  const offset = hashString(playerId) % candidates.length;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[(index + offset) % candidates.length];

    if (candidate !== undefined && candidateIsSafe(candidate, occupancy, context)) {
      return {
        direction: candidate.direction,
        segments: cloneSegments(candidate.segments),
      };
    }
  }

  return null;
}

function hashString(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function isInsideGrid(point: SnakePoint, context: SnakeContext): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < context.gridWidth &&
    point.y < context.gridHeight
  );
}

function isOppositeDirection(
  current: SnakeDirection,
  next: SnakeDirection,
): boolean {
  return (
    (current === "up" && next === "down") ||
    (current === "down" && next === "up") ||
    (current === "left" && next === "right") ||
    (current === "right" && next === "left")
  );
}

function mapPlayersToSnakeState(
  currentSnakes: SnakePlayerState[],
  players: GamePlayerSnapshot[],
): SnakePlayerState[] {
  const previousByPlayerId = new Map(
    currentSnakes.map((snake) => [snake.playerId, snake] as const),
  );
  const orderedPlayers = [...players].sort((left, right) => {
    const nameOrder = left.name.localeCompare(right.name);
    return nameOrder !== 0 ? nameOrder : left.playerId.localeCompare(right.playerId);
  });

  return orderedPlayers.map((player, index) => {
    const previous = previousByPlayerId.get(player.playerId);

    if (previous === undefined) {
      return createSpectatorSnake(player, index);
    }

    return {
      ...previous,
      connected: player.connected,
      head:
        player.connected && previous.head !== null ? clonePoint(previous.head) : null,
      name: player.name,
      segments:
        player.connected && previous.alive ? cloneSegments(previous.segments) : [],
      team: player.team,
      alive: player.connected ? previous.alive : false,
    };
  });
}

function movePoint(point: SnakePoint, direction: SnakeDirection): SnakePoint {
  const vector = directionVector(direction);
  return {
    x: point.x + vector.x,
    y: point.y + vector.y,
  };
}

function pointKey(point: SnakePoint): string {
  return `${point.x}:${point.y}`;
}

function projectSnakeMovement(
  snake: SnakePlayerState,
  queuedDirection: SnakeDirection | undefined,
  initialLength: number,
): SnakePlayerState {
  if (!snake.alive || !snake.connected) {
    return clearSnake({
      ...snake,
      connected: snake.connected,
    });
  }

  const currentHead = snake.segments[0] ?? snake.head;

  if (currentHead === null) {
    return clearSnake(snake);
  }

  const direction =
    queuedDirection === undefined ||
    (isOppositeDirection(snake.direction, queuedDirection) && snake.length > 1)
      ? snake.direction
      : queuedDirection;
  const nextHead = movePoint(currentHead, direction);
  const nextSegments = [
    nextHead,
    ...snake.segments.slice(0, Math.max(0, snake.length - 1)),
  ];

  return {
    ...snake,
    direction,
    head: nextHead,
    length: snake.length || initialLength,
    segments: nextSegments,
  };
}

function queueDirection(
  state: SnakeEngineState,
  event: Extract<SnakeEvent, { type: "direction_received" }>,
): SnakeEngineState {
  const synced = syncPlayers(state, event.players);

  if (synced.publicState.stage !== "running") {
    return synced;
  }

  const snake = synced.publicState.snakes.find(
    (candidate) => candidate.playerId === event.playerId,
  );

  if (snake === undefined || !snake.connected || !snake.alive) {
    return synced;
  }

  return {
    ...synced,
    pendingDirections: {
      ...synced.pendingDirections,
      [event.playerId]: event.dir,
    },
  };
}

function respawnPlayer(
  state: SnakeEngineState,
  playerId: string,
  players: GamePlayerSnapshot[],
  context: SnakeContext,
): SnakeEngineState {
  const synced = syncPlayers(state, players);

  if (synced.publicState.stage !== "running") {
    return synced;
  }

  const respawnTarget = synced.publicState.snakes.find(
    (snake) => snake.playerId === playerId,
  );

  if (respawnTarget === undefined || !respawnTarget.connected || respawnTarget.alive) {
    return synced;
  }

  const spawn = findSafeSpawn(synced.publicState.snakes, playerId, context);

  if (spawn === null) {
    return {
      ...synced,
      publicState: {
        ...synced.publicState,
        latestMessage: `${respawnTarget.name} reconnected but no safe respawn slot was available.`,
      },
    };
  }

  const nextSnakes = synced.publicState.snakes.map((snake) => {
    if (snake.playerId !== playerId) {
      return snake;
    }

    return {
      ...snake,
      alive: true,
      direction: spawn.direction,
      head: clonePoint(spawn.segments[0] ?? { x: 0, y: 0 }),
      length: context.initialLength,
      segments: cloneSegments(spawn.segments),
    };
  });

  return {
    pendingDirections: synced.pendingDirections,
    publicState: {
      ...synced.publicState,
      aliveCount: countAlive(nextSnakes),
      latestMessage: `${respawnTarget.name} rejoined the round.`,
      snakes: nextSnakes,
    },
  };
}

function candidateIsSafe(
  candidate: SpawnCandidate,
  occupancy: Set<string>,
  context: SnakeContext,
): boolean {
  return candidate.segments.every(
    (segment) => isInsideGrid(segment, context) && !occupancy.has(pointKey(segment)),
  );
}

function startRound(
  state: SnakeEngineState,
  context: SnakeContext,
): SnakeEngineState {
  const occupied = new Set<string>();
  const spawnedSnakes = state.publicState.snakes.map((snake) => {
    if (!snake.connected) {
      return clearSnake(snake);
    }

    const spawn = findFirstSpawn(createSpawnCandidates(context), occupied, context, snake.playerId);

    if (spawn === null) {
      return clearSnake(snake);
    }

    for (const segment of spawn.segments) {
      occupied.add(pointKey(segment));
    }

    return {
      ...snake,
      alive: true,
      direction: spawn.direction,
      head: clonePoint(spawn.segments[0] ?? { x: 0, y: 0 }),
      length: context.initialLength,
      segments: cloneSegments(spawn.segments),
    };
  });
  const startedState: SnakeEngineState = {
    pendingDirections: {},
    publicState: {
      ...state.publicState,
      aliveCount: countAlive(spawnedSnakes),
      latestMessage:
        spawnedSnakes.filter((snake) => snake.alive).length === 0
          ? "No safe spawn slots available."
          : "Round live. Avoid walls and other snakes.",
      snakes: spawnedSnakes,
      stage: "running",
      tick: 0,
      tickHz: context.tickHz,
      winnerPlayerId: null,
      winnerTeam: null,
    },
  };

  return finalizeIfNeeded(startedState);
}

function findFirstSpawn(
  candidates: SpawnCandidate[],
  occupied: Set<string>,
  context: SnakeContext,
  playerId: string,
): SpawnCandidate | null {
  const offset = hashString(playerId) % candidates.length;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[(index + offset) % candidates.length];

    if (candidate !== undefined && candidateIsSafe(candidate, occupied, context)) {
      return {
        direction: candidate.direction,
        segments: cloneSegments(candidate.segments),
      };
    }
  }

  return null;
}

function stopRound(
  state: SnakeEngineState,
  players: GamePlayerSnapshot[],
): SnakeEngineState {
  const snakes = mapPlayersToSnakeState(state.publicState.snakes, players).map((snake) =>
    clearSnake(snake),
  );

  return {
    pendingDirections: {},
    publicState: {
      ...state.publicState,
      aliveCount: 0,
      latestMessage: "Round stopped by host.",
      snakes,
      stage: "lobby",
      winnerPlayerId: null,
      winnerTeam: null,
    },
  };
}

function syncPlayers(
  state: SnakeEngineState,
  players: GamePlayerSnapshot[],
): SnakeEngineState {
  const snakes = mapPlayersToSnakeState(state.publicState.snakes, players);
  const activePlayerIds = new Set(snakes.map((snake) => snake.playerId));
  const nextPendingDirections = Object.fromEntries(
    Object.entries(state.pendingDirections).filter(([playerId]) => activePlayerIds.has(playerId)),
  );
  return {
    pendingDirections: nextPendingDirections,
    publicState: {
      ...state.publicState,
      aliveCount: countAlive(snakes),
      latestMessage:
        state.publicState.stage === "lobby"
          ? buildLobbyMessage(players)
          : state.publicState.latestMessage,
      snakes,
    },
  };
}



