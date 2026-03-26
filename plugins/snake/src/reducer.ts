import type { PlayerTeam } from "@game-hub/protocol";
import type { GamePlayerSnapshot } from "@game-hub/sdk";

export const SNAKE_DIRECTION_ACTION = "direction";
export const SNAKE_EFFECT_ACTION = "action";
export const SNAKE_RESTART_ACTION = "restart";
export const SNAKE_ITEMS_CONFIG_ACTION = "snake_items_config";
export const SNAKE_MODE_CONFIG_ACTION = "snake_mode_config";
export const SNAKE_SECRET_QUESTS_CONFIG_ACTION = "snake_secret_quests_config";
export const SNAKE_DEFAULT_TICK_HZ = 12;
export const SNAKE_DEFAULT_GRID_WIDTH = 40;
export const SNAKE_DEFAULT_GRID_HEIGHT = 24;
export const SNAKE_INITIAL_LENGTH = 4;
export const SNAKE_ROUND_SECONDS = 180;
export const SNAKE_COINRUSH_ROUND_SECONDS = 120;
export const SNAKE_RESPAWN_SECONDS = 2.5;
export const SNAKE_SPAWN_PROTECTION_SECONDS = 1;

const SNAKE_COUNTDOWN_SECONDS = 3;
const SNAKE_DROP_RATIO = 0.75;
const SNAKE_FOOD_BASE_TARGET = 2;
const SNAKE_KILL_POINTS = 3;
const SNAKE_FOOD_POINTS = 1;
const SNAKE_BOOST_MULTIPLIER = 1.3;
const SNAKE_BOOST_SECONDS = 2.5;
const SNAKE_MAGNET_SECONDS = 5;
const SNAKE_SHIELD_SECONDS = 6;
const SNAKE_MAGNET_RADIUS = 2;
const SNAKE_ITEM_RESPAWN_DELAY_SECONDS = 1.5;
const SNAKE_ITEM_TARGET_MIN = 1;
const SNAKE_ITEM_TARGET_MAX = 3;
const SNAKE_MIN_ROUND_PLAYERS = 2;
const SNAKE_MAX_ROUND_PLAYERS = 12;

const SNAKE_COIN_AREA_FACTOR = 0.015;
const SNAKE_COIN_ALIVE_FACTOR = 1;
const SNAKE_COINRUSH_ANNOUNCE_SECONDS = 6;
const SNAKE_COINRUSH_ACTIVE_SECONDS = 14;
const SNAKE_COINRUSH_HOTSPOT_COUNT = 2;
const SNAKE_COINRUSH_HOTSPOT_RADIUS = 4;
const SNAKE_COIN_NORMAL_RATIO = 0.8;
const SNAKE_COIN_NORMAL_VALUE = 1;
const SNAKE_COIN_GOLD_VALUE = 3;

const SNAKE_SECRET_QUEST_BONUS_POINTS = 8;
const SNAKE_SECRET_QUEST_DEATHS_MAX = 5;
const SNAKE_SECRET_QUEST_FOOD_STREAK_TARGET = 6;
const SNAKE_SECRET_QUEST_KILLS_TARGET = 6;
const SNAKE_SECRET_QUEST_DROP_FOOD_TARGET = 6;
const SNAKE_SECRET_QUEST_WRAP_TARGET = 8;
const SNAKE_SECRET_QUEST_SURVIVE_NO_ITEM_SECONDS = 30;

const SNAKE_SECRET_QUEST_POOL_LOW: SnakeSecretQuestType[] = [
  "deaths_max_5_round",
  "food_streak_6_no_death",
  "wrap_8",
];

const SNAKE_SECRET_QUEST_POOL_HIGH: SnakeSecretQuestType[] = [
  "kills_6",
  "drop_food_6",
  "survive_30s_no_item",
];

const SNAKE_COLORS = [
  "#0f8b8d",
  "#f4a259",
  "#bc4b51",
  "#4d9078",
  "#8d6a9f",
  "#577590",
  "#f28482",
  "#7c9c3c",
  "#4361ee",
  "#2a9d8f",
  "#ef476f",
  "#ffb703",
] as const;

const SNAKE_GRID_PRESETS: Record<number, { gridHeight: number; gridWidth: number }> = {
  2: { gridHeight: 18, gridWidth: 28 },
  3: { gridHeight: 20, gridWidth: 34 },
  4: { gridHeight: 24, gridWidth: 40 },
  5: { gridHeight: 26, gridWidth: 44 },
  6: { gridHeight: 28, gridWidth: 48 },
  7: { gridHeight: 30, gridWidth: 52 },
  8: { gridHeight: 32, gridWidth: 56 },
  9: { gridHeight: 34, gridWidth: 60 },
  10: { gridHeight: 36, gridWidth: 64 },
  11: { gridHeight: 38, gridWidth: 68 },
  12: { gridHeight: 40, gridWidth: 72 },
};

const DEFAULT_DIRECTIONS: SnakeDirection[] = ["right", "left", "down", "up"];
const SPAWN_EDGE_ANCHORS = [0.1, 0.24, 0.38, 0.52, 0.66, 0.8, 0.92] as const;
const ITEM_TYPES: SnakeItemType[] = ["boost", "magnet", "shield"];
const COINRUSH_HOTSPOT_ANCHORS = [
  { x: 0.18, y: 0.2 },
  { x: 0.35, y: 0.28 },
  { x: 0.62, y: 0.22 },
  { x: 0.82, y: 0.35 },
  { x: 0.76, y: 0.7 },
  { x: 0.52, y: 0.82 },
  { x: 0.26, y: 0.74 },
  { x: 0.14, y: 0.48 },
] as const;

export type SnakeStage = "lobby" | "countdown" | "running" | "game_over";
export type SnakeDirection = "up" | "down" | "left" | "right";
export type SnakeFoodSource = "normal" | "drop";
export type SnakeItemType = "boost" | "magnet" | "shield";
export type SnakeRoundMode = "standard" | "coinrush";
export type SnakeCoinType = "normal" | "gold";
export type SnakeCoinrushPhase = "announce" | "active";
export type SnakeSecretQuestType =
  | "deaths_max_5_round"
  | "food_streak_6_no_death"
  | "kills_6"
  | "drop_food_6"
  | "wrap_8"
  | "survive_30s_no_item";

export interface SnakePoint {
  x: number;
  y: number;
}

export interface SnakeFood {
  point: SnakePoint;
  source: SnakeFoodSource;
}

export interface SnakeItem {
  point: SnakePoint;
  type: SnakeItemType;
}

export interface SnakeCoin {
  point: SnakePoint;
  type: SnakeCoinType;
  value: number;
}

export interface SnakeCoinrushState {
  activeHotspots: SnakePoint[];
  announcedHotspots: SnakePoint[];
  phase: SnakeCoinrushPhase | null;
  phaseTicksRemaining: number;
  wave: number;
}

export interface SnakeItemSettings {
  boost: boolean;
  magnet: boolean;
  shield: boolean;
}

export interface SnakeSecretQuestSettings {
  enabled: boolean;
}

export type SnakeSecretQuestLiveStatus = "active" | "completed" | "failed";

export interface SnakeSecretQuestRoundSummaryEntry {
  bonusAwarded: boolean;
  completed: boolean;
  failed: boolean;
  playerId: string;
  questType: SnakeSecretQuestType;
}

export interface SnakeSecretQuestLiveEntry {
  playerId: string;
  progressCurrent: number;
  progressTarget: number;
  questType: SnakeSecretQuestType;
  status: SnakeSecretQuestLiveStatus;
}

interface SnakeSecretQuestProgressInternal {
  deathCountTotal: number;
  dropFoodCount: number;
  foodStreak: number;
  killCount: number;
  surviveNoItemTicks: number;
  wrapCount: number;
}

interface SnakeSecretQuestAssignmentInternal {
  bonusAwarded: boolean;
  completed: boolean;
  failed: boolean;
  playerId: string;
  progress: SnakeSecretQuestProgressInternal;
  questType: SnakeSecretQuestType;
}
interface SnakeSecretQuestMetaInternal {
  roundCounter: number;
  waveFirstToThreeByWave: Record<number, string>;
}

interface SnakeSecretQuestPlayerSignal {
  alive: boolean;
  connected: boolean;
  boostActivated: boolean;
  coinCollected: number;
  deathCount: number;
  dropFoodCollected: number;
  foodCollected: number;
  itemCollected: number;
  killCount: number;
  scoreAfter: number;
  scoreBefore: number;
  wave: number | null;
  wraps: number;
}

interface SnakeQuestSignalFrame {
  byPlayerId: Record<string, SnakeSecretQuestPlayerSignal>;
  playerOrder: string[];
}

interface SecretQuestEvaluationResult {
  assignments: Record<string, SnakeSecretQuestAssignmentInternal>;
  meta: SnakeSecretQuestMetaInternal;
  snakes: SnakePlayerState[];
}

export interface SnakeActiveEffectState {
  charges: number;
  ticksRemaining: number;
  type: SnakeItemType;
}

export interface SnakePlayerState {
  activeEffects: SnakeActiveEffectState[];
  alive: boolean;
  coinCount: number;
  color: string;
  connected: boolean;
  direction: SnakeDirection;
  head: SnakePoint | null;
  length: number;
  name: string;
  playerId: string;
  respawnTicksRemaining: number | null;
  score: number;
  segments: SnakePoint[];
  spawnProtectionTicksRemaining: number;
  speedBank: number;
  team: PlayerTeam;
  wins: number;
}

export interface SnakeState extends Record<string, unknown> {
  aliveCount: number;
  coinrush: SnakeCoinrushState | null;
  coins: SnakeCoin[];
  countdownRemaining: number | null;
  foods: SnakeFood[];
  grid: {
    height: number;
    width: number;
  };
  itemSettings: SnakeItemSettings;
  items: SnakeItem[];
  latestMessage: string;
  secretQuestLive: SnakeSecretQuestLiveEntry[] | null;
  secretQuestRoundSummary: SnakeSecretQuestRoundSummaryEntry[] | null;
  secretQuestSettings: SnakeSecretQuestSettings;
  roundMode: SnakeRoundMode;
  roundSecondsRemaining: number | null;
  showIdentityLabels: boolean;
  snakes: SnakePlayerState[];
  stage: SnakeStage;
  tick: number;
  tickHz: number;
  winnerPlayerId: string | null;
  winnerTeam: PlayerTeam | null;
}

export interface SnakeEngineState {
  coinSpawnCursor: number;
  countdownTicksRemaining: number | null;
  itemRespawnDelayTicksRemaining: number;
  itemSpawnCursor: number;
  itemTypeCursor: number;
  magnetAdjacencyPrimed: Record<string, { coin: boolean; food: boolean }>;
  pendingDirections: Record<string, SnakeDirection>;
  publicState: SnakeState;
  roundItemSettings: SnakeItemSettings;
  roundModeFrozen: SnakeRoundMode;
  roundQuestAssignments: Record<string, SnakeSecretQuestAssignmentInternal>;
  roundQuestMeta: SnakeSecretQuestMetaInternal;
  roundSecretQuestEnabled: boolean;
  roundTicksRemaining: number | null;
  spawnEpoch: number;
}

export interface SnakeContext {
  gridHeight: number;
  gridWidth: number;
  initialLength: number;
  tickHz: number;
}

export type SnakeEvent =
  | {
      dir: SnakeDirection;
      playerId: string;
      players: GamePlayerSnapshot[];
      type: "direction_received";
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
      mode: SnakeRoundMode;
      playerId: string;
      players: GamePlayerSnapshot[];
      type: "mode_config_received";
    }
  | {
      playerId: string;
      players: GamePlayerSnapshot[];
      type: "items_config_received";
      settings: Partial<SnakeItemSettings>;
    }
  | {
      enabled: boolean;
      playerId: string;
      players: GamePlayerSnapshot[];
      type: "secret_quests_config_received";
    }
  | {
      playerId: string;
      players: GamePlayerSnapshot[];
      type: "player_reconnected";
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

interface MovementPlan {
  bankRemainder: number;
  steps: number;
}

interface SnakeDeathRecord {
  length: number;
  playerId: string;
  segments: SnakePoint[];
}

interface SubstepResolution {
  deaths: SnakeDeathRecord[];
  killPoints: Map<string, number>;
  snakes: SnakePlayerState[];
  wrapsByPlayer: Map<string, number>;
}

interface FoodConsumptionResult {
  consumedByPlayer: Map<string, { drop: number; normal: number; total: number }>;
  foods: SnakeFood[];
  snakes: SnakePlayerState[];
}

interface CoinConsumptionResult {
  coins: SnakeCoin[];
  consumedByPlayer: Map<string, number>;
  snakes: SnakePlayerState[];
}

interface ItemConsumptionResult {
  activatedBoostPlayers: Set<string>;
  consumedByPlayer: Map<string, number>;
  delayTriggered: boolean;
  items: SnakeItem[];
  snakes: SnakePlayerState[];
}

interface ItemRefillResult {
  items: SnakeItem[];
  nextCursor: number;
  nextTypeCursor: number;
}

interface CoinRefillResult {
  coins: SnakeCoin[];
  nextCursor: number;
}

interface MagnetPullResult {
  coinOwnersByKey: Map<string, string>;
  coins: SnakeCoin[];
  foodOwnersByKey: Map<string, string>;
  foods: SnakeFood[];
}

interface MagnetAdjacencyConsumptionResult {
  coins: SnakeCoin[];
  consumedCoinsByPlayer: Map<string, number>;
  consumedFoodsByPlayer: Map<string, { drop: number; normal: number; total: number }>;
  foods: SnakeFood[];
  nextPrimed: Record<string, { coin: boolean; food: boolean }>;
  snakes: SnakePlayerState[];
}

export function createSnakeContext(options: Partial<SnakeContext> = {}): SnakeContext {
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
  const lobbyGrid = resolveLobbyGridDimensions(players.filter((player) => player.connected).length);
  const lobbyContext = buildEffectiveContext(context, lobbyGrid.width, lobbyGrid.height);
  const mappedSnakes = mapPlayersToSnakeState([], players, lobbyContext);
  const snakes = placeLobbySnakes(mappedSnakes, lobbyContext, 0);
  const itemSettings = createDefaultItemSettings();
  const secretQuestSettings = createDefaultSecretQuestSettings();

  return {
    coinSpawnCursor: 0,
    countdownTicksRemaining: null,
    itemRespawnDelayTicksRemaining: 0,
    itemSpawnCursor: 0,
    itemTypeCursor: 0,
    magnetAdjacencyPrimed: {},
    pendingDirections: {},
    publicState: {
      aliveCount: countAlive(snakes),
      coinrush: null,
      coins: [],
      countdownRemaining: null,
      foods: [],
      grid: {
        height: lobbyContext.gridHeight,
        width: lobbyContext.gridWidth,
      },
      itemSettings,
      items: [],
      latestMessage: buildLobbyMessage(players),
      secretQuestLive: null,
      secretQuestRoundSummary: null,
      secretQuestSettings,
      roundMode: "standard",
      roundSecondsRemaining: null,
      showIdentityLabels: true,
      snakes,
      stage: "lobby",
      tick: 0,
      tickHz: context.tickHz,
      winnerPlayerId: null,
      winnerTeam: null,
    },
    roundItemSettings: itemSettings,
    roundModeFrozen: "standard",
    roundQuestAssignments: {},
    roundQuestMeta: createInitialSecretQuestMeta(),
    roundSecretQuestEnabled: false,
    roundTicksRemaining: null,
    spawnEpoch: 0,
  };
}

export function reduceSnakeEngineState(
  state: SnakeEngineState,
  event: SnakeEvent,
  context: SnakeContext,
): SnakeEngineState {
  switch (event.type) {
    case "game_started":
      return startRound(state, event.players, context);
    case "restart_requested":
      return startRound(state, event.players, context);
    case "game_stopped":
      return stopRound(syncPlayers(state, event.players, context), event.players, context);
    case "session_synced":
      return syncPlayers(state, event.players, context);
    case "direction_received":
      return queueDirection(syncPlayers(state, event.players, context), event);
    case "items_config_received":
      return applyItemSettings(syncPlayers(state, event.players, context), event.settings);
    case "mode_config_received":
      return applyRoundMode(syncPlayers(state, event.players, context), event.mode);
    case "secret_quests_config_received":
      return applySecretQuestSettings(syncPlayers(state, event.players, context), event.enabled);
    case "player_reconnected":
      return markReconnect(syncPlayers(state, event.players, context), event.playerId);
    case "tick":
      return advanceTick(syncPlayers(state, event.players, context), context);
    default:
      return state;
  }
}

function advanceTick(state: SnakeEngineState, context: SnakeContext): SnakeEngineState {
  if (state.publicState.stage === "lobby" || state.publicState.stage === "game_over") {
    return state;
  }

  if (state.publicState.stage === "countdown") {
    return advanceCountdown(state, context);
  }

  return advanceRunningTick(state, context);
}

function advanceCountdown(state: SnakeEngineState, context: SnakeContext): SnakeEngineState {
  const countdownTicks =
    state.countdownTicksRemaining ?? toTicks(SNAKE_COUNTDOWN_SECONDS, context.tickHz);
  const nextTicks = Math.max(0, countdownTicks - 1);

  if (nextTicks > 0) {
    const remaining = Math.max(1, Math.ceil(nextTicks / context.tickHz));
    return {
      ...state,
      countdownTicksRemaining: nextTicks,
      publicState: {
        ...state.publicState,
        countdownRemaining: remaining,
        latestMessage: `Round starts in ${remaining}...`,
      },
    };
  }

  return beginRunning(
    {
      ...state,
      countdownTicksRemaining: 0,
      publicState: {
        ...state.publicState,
        countdownRemaining: 0,
        latestMessage: "GO!",
      },
    },
    context,
  );
}

function beginRunning(state: SnakeEngineState, context: SnakeContext): SnakeEngineState {
  const roundContext = buildEffectiveContextFromStateGrid(context, state.publicState);
  const roundModeFrozen = state.publicState.roundMode;
  const roundSeconds = roundModeFrozen === "coinrush" ? SNAKE_COINRUSH_ROUND_SECONDS : SNAKE_ROUND_SECONDS;
  const roundTicks = toTicks(roundSeconds, context.tickHz);
  const roundItemSettings = cloneItemSettings(state.publicState.itemSettings);
  const roundSecretQuestEnabled = state.publicState.secretQuestSettings.enabled;
  const nextRoundCounter = state.roundQuestMeta.roundCounter + 1;
  const roundQuestMeta: SnakeSecretQuestMetaInternal = {
    roundCounter: nextRoundCounter,
    waveFirstToThreeByWave: {},
  };
  const snakes = state.publicState.snakes.map((snake) => ({
    ...snake,
    activeEffects: [],
    coinCount: 0,
    head: snake.head === null ? null : clonePoint(snake.head),
    segments: cloneSegments(snake.segments),
    spawnProtectionTicksRemaining: 0,
    speedBank: 0,
  }));
  const aliveCount = countAlive(snakes);
  const reservedRespawnPoints = buildRespawnReservationPoints(snakes, [], [], [], roundContext);
  const foods = refillFoods(
    [],
    snakes,
    [],
    [],
    roundContext,
    reservedRespawnPoints,
    state.publicState.tick,
  );
  const initialItems = refillItems(
    [],
    snakes,
    foods,
    [],
    roundContext,
    roundItemSettings,
    state.itemSpawnCursor,
    state.itemTypeCursor,
    reservedRespawnPoints,
  );
  const coinrush =
    roundModeFrozen === "coinrush"
      ? createCoinrushAnnouncementState(roundContext, 1, context.tickHz)
      : null;
  const roundQuestAssignments = roundSecretQuestEnabled
    ? assignSecretQuestsForRound(snakes, roundModeFrozen, roundItemSettings, nextRoundCounter)
    : {};
  const effectiveRoundSecretQuestEnabled =
    roundSecretQuestEnabled && Object.keys(roundQuestAssignments).length > 0;
  const secretQuestLive = effectiveRoundSecretQuestEnabled
    ? buildSecretQuestLive(roundQuestAssignments, context.tickHz)
    : null;

  return {
    ...state,
    coinSpawnCursor: 0,
    countdownTicksRemaining: null,
    itemRespawnDelayTicksRemaining: 0,
    itemSpawnCursor: initialItems.nextCursor,
    itemTypeCursor: initialItems.nextTypeCursor,
    magnetAdjacencyPrimed: {},
    pendingDirections: state.pendingDirections,
    publicState: {
      ...state.publicState,
      aliveCount,
      coinrush,
      coins: [],
      countdownRemaining: null,
      foods,
      items: initialItems.items,
      latestMessage: buildRunningMessage(aliveCount, roundSeconds, roundModeFrozen, snakes),
      roundSecondsRemaining: roundSeconds,
      secretQuestLive,
      secretQuestRoundSummary: null,
      showIdentityLabels: false,
      snakes,
      stage: "running",
      tick: 0,
      winnerPlayerId: null,
      winnerTeam: null,
    },
    roundItemSettings,
    roundModeFrozen,
    roundQuestAssignments,
    roundQuestMeta,
    roundSecretQuestEnabled: effectiveRoundSecretQuestEnabled,
    roundTicksRemaining: roundTicks,
  };
}

function advanceRunningTick(state: SnakeEngineState, context: SnakeContext): SnakeEngineState {
  const roundContext = buildEffectiveContextFromStateGrid(context, state.publicState);
  const respawnTicks = toTicks(SNAKE_RESPAWN_SECONDS, context.tickHz);
  const itemRespawnDelayTicks = toTicks(SNAKE_ITEM_RESPAWN_DELAY_SECONDS, context.tickHz);
  const nextTick = state.publicState.tick + 1;

  let snakes = state.publicState.snakes.map((snake) => cloneSnake(snake));
  let foods = cloneFoods(state.publicState.foods);
  let items = cloneItems(state.publicState.items);
  let coins = cloneCoins(state.publicState.coins);
  let coinrush = cloneCoinrush(state.publicState.coinrush);
  let itemDelay = state.itemRespawnDelayTicksRemaining;
  let itemCursor = state.itemSpawnCursor;
  let itemTypeCursor = state.itemTypeCursor;
  let coinCursor = state.coinSpawnCursor;
  let roundQuestAssignments = cloneSecretQuestAssignments(state.roundQuestAssignments);
  let roundQuestMeta = cloneSecretQuestMeta(state.roundQuestMeta);
  let magnetAdjacencyPrimed = cloneMagnetAdjacencyPrimed(state.magnetAdjacencyPrimed);

  const questSignals = createQuestSignalFrame(snakes);

  snakes = applyQueuedDirections(snakes, state.pendingDirections);
  snakes = decrementRespawnTimers(snakes);

  const movementPlans = buildMovementPlans(snakes);
  const maxSteps = Math.max(0, ...Array.from(movementPlans.values(), (plan) => plan.steps));
  const activatedEffects = new Set<string>();
  const respawnedIds = new Set<string>();

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const substep = resolveMovementSubstep(
      snakes,
      movementPlans,
      stepIndex,
      roundContext,
      respawnTicks,
    );
    snakes = substep.snakes;
    recordSubstepQuestSignals(questSignals, substep);
    foods = placeDeathDrops(foods, substep.deaths, snakes, items, coins, roundContext);
    snakes = applyKillPoints(snakes, substep.killPoints);

    const foodAfterMovement = consumeFoods(snakes, foods);
    snakes = foodAfterMovement.snakes;
    foods = foodAfterMovement.foods;
    recordFoodQuestSignals(questSignals, foodAfterMovement.consumedByPlayer);

    const coinAfterMovement = consumeCoins(snakes, coins);
    snakes = coinAfterMovement.snakes;
    coins = coinAfterMovement.coins;
    recordCoinQuestSignals(
      questSignals,
      coinAfterMovement.consumedByPlayer,
      coinrush?.phase === "active" ? coinrush.wave : null,
    );

    const itemAfterMovement = consumeItems(
      snakes,
      items,
      state.roundItemSettings,
      context.tickHz,
      activatedEffects,
    );
    snakes = itemAfterMovement.snakes;
    items = itemAfterMovement.items;
    if (itemAfterMovement.delayTriggered) {
      itemDelay = itemRespawnDelayTicks;
    }
    recordItemQuestSignals(
      questSignals,
      itemAfterMovement.consumedByPlayer,
      itemAfterMovement.activatedBoostPlayers,
    );
  }

  const magnetResult = applyMagnetPull(snakes, foods, coins, items, roundContext, state.roundModeFrozen);
  foods = magnetResult.foods;
  coins = magnetResult.coins;

  const foodAfterMagnet = consumeFoods(snakes, foods);
  snakes = foodAfterMagnet.snakes;
  foods = foodAfterMagnet.foods;
  recordFoodQuestSignals(questSignals, foodAfterMagnet.consumedByPlayer);

  const coinAfterMagnet = consumeCoins(snakes, coins);
  snakes = coinAfterMagnet.snakes;
  coins = coinAfterMagnet.coins;
  recordCoinQuestSignals(
    questSignals,
    coinAfterMagnet.consumedByPlayer,
    coinrush?.phase === "active" ? coinrush.wave : null,
  );
  const magnetAdjacencyConsumption = consumeMagnetAdjacentCollectibles(
    snakes,
    foods,
    coins,
    magnetResult.foodOwnersByKey,
    magnetResult.coinOwnersByKey,
    magnetAdjacencyPrimed,
    roundContext,
  );
  snakes = magnetAdjacencyConsumption.snakes;
  foods = magnetAdjacencyConsumption.foods;
  coins = magnetAdjacencyConsumption.coins;
  magnetAdjacencyPrimed = magnetAdjacencyConsumption.nextPrimed;
  recordFoodQuestSignals(questSignals, magnetAdjacencyConsumption.consumedFoodsByPlayer);
  recordCoinQuestSignals(
    questSignals,
    magnetAdjacencyConsumption.consumedCoinsByPlayer,
    coinrush?.phase === "active" ? coinrush.wave : null,
  );
  const respawnResult = respawnEligibleSnakes(
    snakes,
    foods,
    items,
    coins,
    roundContext,
    context.tickHz,
  );
  snakes = respawnResult.snakes;
  for (const playerId of respawnResult.respawnedPlayerIds) {
    respawnedIds.add(playerId);
  }

  const reservedRespawnPoints = buildRespawnReservationPoints(snakes, foods, items, coins, roundContext);

  foods = refillFoods(foods, snakes, items, coins, roundContext, reservedRespawnPoints, nextTick);

  if (state.roundModeFrozen === "coinrush") {
    const previousCoinrushPhase = coinrush?.phase ?? null;
    coinrush = advanceCoinrushState(coinrush, roundContext, context.tickHz);
    if (previousCoinrushPhase === "active" && coinrush.phase === "announce") {
      coins = [];
    }
    const activeHotspots =
      coinrush.phase === "active" ? coinrush.activeHotspots : [];
    const coinRefill = refillCoins(
      coins,
      snakes,
      foods,
      items,
      roundContext,
      reservedRespawnPoints,
      activeHotspots,
      coinCursor,
      nextTick,
    );
    coins = coinRefill.coins;
    coinCursor = coinRefill.nextCursor;
  } else {
    coins = [];
    coinrush = null;
    coinCursor = 0;
  }

  if (itemDelay > 0) {
    itemDelay = Math.max(0, itemDelay - 1);
  }

  if (itemDelay === 0) {
    const refillItemsResult = refillItems(
      items,
      snakes,
      foods,
      coins,
      roundContext,
      state.roundItemSettings,
      itemCursor,
      itemTypeCursor,
      reservedRespawnPoints,
    );
    items = refillItemsResult.items;
    itemCursor = refillItemsResult.nextCursor;
    itemTypeCursor = refillItemsResult.nextTypeCursor;
  }

  snakes = decrementProtectionAndEffects(snakes, activatedEffects, respawnedIds);
  snakes = applySpeedBankRemainders(snakes, movementPlans);

  finalizeQuestSignalFrame(questSignals, snakes);

  if (state.roundSecretQuestEnabled) {
    const questResult = advanceSecretQuests(
      roundQuestAssignments,
      roundQuestMeta,
      questSignals,
      snakes,
      context.tickHz,
    );
    roundQuestAssignments = questResult.assignments;
    roundQuestMeta = questResult.meta;
    snakes = questResult.snakes;
  }

  const nextRoundTicks = Math.max(0, (state.roundTicksRemaining ?? 0) - 1);
  const nextRoundSeconds = Math.ceil(nextRoundTicks / context.tickHz);
  const aliveCount = countAlive(snakes);
  const nextState: SnakeEngineState = {
    ...state,
    coinSpawnCursor: coinCursor,
    countdownTicksRemaining: null,
    itemRespawnDelayTicksRemaining: itemDelay,
    itemSpawnCursor: itemCursor,
    itemTypeCursor,
    magnetAdjacencyPrimed,
    pendingDirections: {},
    publicState: {
      ...state.publicState,
      aliveCount,
      coinrush,
      coins,
      foods,
      items,
      latestMessage: buildRunningMessage(aliveCount, nextRoundSeconds, state.roundModeFrozen, snakes),
      roundSecondsRemaining: nextRoundSeconds,
      secretQuestLive: state.roundSecretQuestEnabled ? buildSecretQuestLive(roundQuestAssignments, context.tickHz) : null,
      secretQuestRoundSummary: null,
      snakes,
      tick: nextTick,
    },
    roundQuestAssignments,
    roundQuestMeta,
    roundTicksRemaining: nextRoundTicks,
  };

  if (nextRoundTicks <= 0) {
    return finalizeRoundByTime(nextState);
  }

  return nextState;
}

function finalizeRoundByTime(state: SnakeEngineState): SnakeEngineState {
  const finalizedQuests = state.roundSecretQuestEnabled
    ? finalizeRoundEndSecretQuests(state.roundQuestAssignments, state.publicState.snakes)
    : {
        assignments: cloneSecretQuestAssignments(state.roundQuestAssignments),
        snakes: state.publicState.snakes.map((snake) => cloneSnake(snake)),
      };

  const resolved =
    state.roundModeFrozen === "coinrush"
      ? resolveWinnerByCoins(finalizedQuests.snakes)
      : resolveWinnerByScore(finalizedQuests.snakes);
  const snakes = finalizedQuests.snakes.map((snake) => {
    if (resolved.winner?.playerId === snake.playerId) {
      return {
        ...snake,
        wins: snake.wins + 1,
      };
    }

    return snake;
  });
  const aliveCount = countAlive(snakes);
  const secretQuestRoundSummary = buildSecretQuestRoundSummary(finalizedQuests.assignments);
  const latestMessage =
    state.roundModeFrozen === "coinrush"
      ? resolved.winner === null
        ? `Coinrush time up. Draw at ${resolved.topValue} coins.`
        : `${resolved.winner.name} wins Coinrush with ${resolved.winner.coinCount} coins.`
      : resolved.winner === null
        ? `Time up. Draw at ${resolved.topValue} points.`
        : `${resolved.winner.name} wins with ${resolved.winner.score} points.`;

  return {
    ...state,
    countdownTicksRemaining: null,
    magnetAdjacencyPrimed: {},
    pendingDirections: {},
    publicState: {
      ...state.publicState,
      aliveCount,
      countdownRemaining: null,
      latestMessage,
      roundSecondsRemaining: 0,
      secretQuestLive: null,
      secretQuestRoundSummary,
      showIdentityLabels: false,
      snakes,
      stage: "game_over",
      winnerPlayerId: resolved.winner?.playerId ?? null,
      winnerTeam: resolved.winner?.team ?? null,
    },
    roundQuestAssignments: finalizedQuests.assignments,
    roundTicksRemaining: 0,
  };
}

function buildLobbyMessage(players: GamePlayerSnapshot[]): string {
  const connectedPlayers = players.filter((player) => player.connected).length;
  if (connectedPlayers < SNAKE_MIN_ROUND_PLAYERS) {
    return `Waiting for players (${connectedPlayers}/${SNAKE_MIN_ROUND_PLAYERS})...`;
  }

  if (connectedPlayers > SNAKE_MAX_ROUND_PLAYERS) {
    return `Too many players connected (${connectedPlayers}/${SNAKE_MAX_ROUND_PLAYERS}).`;
  }

  return `${connectedPlayers} players ready. Host can start Snake.`;
}

function buildRunningMessage(
  aliveCount: number,
  secondsRemaining: number,
  mode: SnakeRoundMode,
  snakes: SnakePlayerState[],
): string {
  if (mode === "coinrush") {
    const leaderCoins = Math.max(0, ...snakes.map((snake) => snake.coinCount));
    return `${aliveCount} alive / ${Math.max(0, secondsRemaining)}s left / leader ${leaderCoins}c`;
  }

  return `${aliveCount} alive / ${Math.max(0, secondsRemaining)}s left`;
}

function applyItemSettings(
  state: SnakeEngineState,
  settings: Partial<SnakeItemSettings>,
): SnakeEngineState {
  if (state.publicState.stage !== "lobby" && state.publicState.stage !== "countdown") {
    return state;
  }

  const nextSettings: SnakeItemSettings = {
    boost: settings.boost ?? state.publicState.itemSettings.boost,
    magnet: settings.magnet ?? state.publicState.itemSettings.magnet,
    shield: settings.shield ?? state.publicState.itemSettings.shield,
  };

  return {
    ...state,
    publicState: {
      ...state.publicState,
      itemSettings: nextSettings,
      latestMessage:
        state.publicState.stage === "lobby"
          ? state.publicState.latestMessage
          : "Item settings updated for this countdown.",
    },
  };
}

function applySecretQuestSettings(state: SnakeEngineState, enabled: boolean): SnakeEngineState {
  if (state.publicState.stage !== "lobby" && state.publicState.stage !== "countdown") {
    return state;
  }

  if (state.publicState.secretQuestSettings.enabled === enabled) {
    return state;
  }

  return {
    ...state,
    publicState: {
      ...state.publicState,
      latestMessage:
        state.publicState.stage === "lobby"
          ? state.publicState.latestMessage
          : `Secret quests ${enabled ? "enabled" : "disabled"} for this countdown.`,
      secretQuestSettings: {
        enabled,
      },
    },
  };
}

function applyRoundMode(
  state: SnakeEngineState,
  mode: SnakeRoundMode,
): SnakeEngineState {
  if (state.publicState.stage !== "lobby" && state.publicState.stage !== "countdown") {
    return state;
  }

  return {
    ...state,
    publicState: {
      ...state.publicState,
      latestMessage:
        state.publicState.stage === "lobby"
          ? state.publicState.latestMessage
          : `Round mode updated: ${mode}.`,
      roundMode: mode,
    },
  };
}

function applyQueuedDirections(
  snakes: SnakePlayerState[],
  pendingDirections: Record<string, SnakeDirection>,
): SnakePlayerState[] {
  return snakes.map((snake) => {
    const queued = pendingDirections[snake.playerId];
    if (
      queued === undefined ||
      !snake.alive ||
      !snake.connected ||
      (isOppositeDirection(snake.direction, queued) && snake.length > 1)
    ) {
      return snake;
    }

    return {
      ...snake,
      direction: queued,
    };
  });
}

function buildMovementPlans(snakes: SnakePlayerState[]): Map<string, MovementPlan> {
  const plans = new Map<string, MovementPlan>();

  for (const snake of snakes) {
    if (!snake.alive || !snake.connected) {
      plans.set(snake.playerId, { bankRemainder: 0, steps: 0 });
      continue;
    }

    const multiplier = hasActiveEffect(snake, "boost") ? SNAKE_BOOST_MULTIPLIER : 1;
    const nextBank = snake.speedBank + multiplier;
    const steps = Math.max(1, Math.floor(nextBank));
    const bankRemainder = nextBank - steps;
    plans.set(snake.playerId, { bankRemainder, steps });
  }

  return plans;
}

function resolveMovementSubstep(
  snakes: SnakePlayerState[],
  movementPlans: Map<string, MovementPlan>,
  stepIndex: number,
  context: SnakeContext,
  respawnTicks: number,
): SubstepResolution {
  const beforeByPlayerId = new Map(
    snakes.map((snake) => [snake.playerId, cloneSnake(snake)] as const),
  );
  const movingPlayerIds = new Set<string>();
  const wrappedByPlayer = new Map<string, number>();
  const proposed = snakes.map((snake) => {
    const plan = movementPlans.get(snake.playerId);
    if (!snake.alive || !snake.connected || plan === undefined || stepIndex >= plan.steps) {
      return cloneSnake(snake);
    }

    movingPlayerIds.add(snake.playerId);
    const moved = moveSnakeOneStep(snake, context);
    if (moved.didWrap) {
      wrappedByPlayer.set(snake.playerId, (wrappedByPlayer.get(snake.playerId) ?? 0) + 1);
    }
    return moved.snake;
  });

  const occupancy = buildCellOccupancy(proposed);
  const rollback = new Set<string>();
  const consumeShield = new Set<string>();
  const deathMetadata = new Map<
    string,
    {
      killerId: string | null;
      reason: "foreign" | "head_on" | "self";
    }
  >();

  const proposedByPlayerId = new Map(proposed.map((snake) => [snake.playerId, snake] as const));

  for (const snake of proposed) {
    if (!movingPlayerIds.has(snake.playerId) || !snake.alive || !snake.connected) {
      continue;
    }

    const head = snake.segments[0];
    if (head === undefined) {
      deathMetadata.set(snake.playerId, { killerId: null, reason: "self" });
      continue;
    }

    const headKey = pointKey(head);
    const collidingBodyPlayerIds = uniqueStrings(
      (occupancy.owners.get(headKey) ?? []).filter((playerId) => playerId !== snake.playerId),
    );
    const collidingHeadPlayerIds = uniqueStrings(
      (occupancy.heads.get(headKey) ?? []).filter((playerId) => playerId !== snake.playerId),
    );
    const selfCollision = snake.segments.slice(1).some((segment) => samePoint(segment, head));

    if (!selfCollision && collidingBodyPlayerIds.length === 0) {
      continue;
    }

    if (selfCollision) {
      if (hasShieldCharge(snake)) {
        rollback.add(snake.playerId);
        consumeShield.add(snake.playerId);
      } else {
        deathMetadata.set(snake.playerId, { killerId: null, reason: "self" });
      }
      continue;
    }

    const isHeadOn = collidingHeadPlayerIds.length > 0;
    const opposingPlayerIds = isHeadOn ? collidingHeadPlayerIds : collidingBodyPlayerIds;
    const hasProtectedParticipant =
      snake.spawnProtectionTicksRemaining > 0 ||
      opposingPlayerIds.some((playerId) => {
        const candidate = proposedByPlayerId.get(playerId);
        return candidate !== undefined && candidate.spawnProtectionTicksRemaining > 0;
      });

    if (hasProtectedParticipant) {
      rollback.add(snake.playerId);
      continue;
    }

    if (hasShieldCharge(snake)) {
      rollback.add(snake.playerId);
      consumeShield.add(snake.playerId);
      continue;
    }

    if (isHeadOn) {
      deathMetadata.set(snake.playerId, { killerId: null, reason: "head_on" });
      continue;
    }

    deathMetadata.set(snake.playerId, {
      killerId: collidingBodyPlayerIds.length === 1 ? collidingBodyPlayerIds[0] ?? null : null,
      reason: "foreign",
    });
  }

  const deaths: SnakeDeathRecord[] = [];
  const nextSnakes = proposed.map((snake) => {
    if (rollback.has(snake.playerId)) {
      const rollbackSnake = beforeByPlayerId.get(snake.playerId) ?? snake;
      if (consumeShield.has(snake.playerId)) {
        return consumeShieldCharge(rollbackSnake);
      }
      return rollbackSnake;
    }

    if (deathMetadata.has(snake.playerId)) {
      deaths.push({
        length: snake.length,
        playerId: snake.playerId,
        segments: cloneSegments(snake.segments),
      });
      return makeDeadSnake(snake, respawnTicks);
    }

    return snake;
  });

  const nextByPlayerId = new Map(nextSnakes.map((snake) => [snake.playerId, snake] as const));
  const killPoints = new Map<string, number>();
  for (const [victimId, metadata] of deathMetadata) {
    if (metadata.reason !== "foreign" || metadata.killerId === null || metadata.killerId === victimId) {
      continue;
    }

    const killer = nextByPlayerId.get(metadata.killerId);
    if (killer === undefined || !killer.alive || !killer.connected) {
      continue;
    }

    killPoints.set(
      metadata.killerId,
      (killPoints.get(metadata.killerId) ?? 0) + SNAKE_KILL_POINTS,
    );
  }

  const wrapsByPlayer = new Map<string, number>();
  for (const [playerId, wraps] of wrappedByPlayer) {
    if (wraps <= 0 || rollback.has(playerId) || deathMetadata.has(playerId)) {
      continue;
    }
    const snake = nextByPlayerId.get(playerId);
    if (snake === undefined || !snake.alive || !snake.connected) {
      continue;
    }
    wrapsByPlayer.set(playerId, wraps);
  }

  return {
    deaths,
    killPoints,
    snakes: nextSnakes,
    wrapsByPlayer,
  };
}

function moveSnakeOneStep(
  snake: SnakePlayerState,
  context: SnakeContext,
): { didWrap: boolean; snake: SnakePlayerState } {
  const currentHead = snake.segments[0] ?? snake.head;
  if (currentHead === undefined || currentHead === null) {
    return {
      didWrap: false,
      snake,
    };
  }

  const movedHead = movePoint(currentHead, snake.direction);
  const nextHead = wrapPoint(movedHead, context);
  const nextSegments = [nextHead, ...snake.segments.slice(0, Math.max(0, snake.length - 1))];
  const didWrap = movedHead.x !== nextHead.x || movedHead.y !== nextHead.y;

  return {
    didWrap,
    snake: {
      ...snake,
      head: clonePoint(nextHead),
      segments: cloneSegments(nextSegments),
    },
  };
}
function applyKillPoints(snakes: SnakePlayerState[], killPoints: Map<string, number>): SnakePlayerState[] {
  if (killPoints.size === 0) {
    return snakes;
  }

  return snakes.map((snake) => {
    const points = killPoints.get(snake.playerId);
    if (points === undefined || points <= 0) {
      return snake;
    }

    return {
      ...snake,
      score: snake.score + points,
    };
  });
}

function consumeFoods(
  snakes: SnakePlayerState[],
  foods: SnakeFood[],
): FoodConsumptionResult {
  if (foods.length === 0) {
    return {
      consumedByPlayer: new Map(),
      foods,
      snakes,
    };
  }

  const foodKeys = new Map<string, SnakeFood>();
  for (const food of foods) {
    const key = pointKey(food.point);
    if (!foodKeys.has(key)) {
      foodKeys.set(key, food);
    }
  }

  const consumedKeys = new Set<string>();
  const consumedByPlayer = new Map<string, { drop: number; normal: number; total: number }>();
  const nextSnakes = snakes.map((snake) => cloneSnake(snake));
  const indexByPlayerId = new Map(nextSnakes.map((snake, index) => [snake.playerId, index] as const));
  const orderedConsumers = [...nextSnakes]
    .filter((snake) => snake.alive && snake.connected && snake.head !== null)
    .sort((left, right) => left.playerId.localeCompare(right.playerId));

  for (const consumer of orderedConsumers) {
    const key = pointKey(consumer.head ?? { x: -1, y: -1 });
    const consumedFood = foodKeys.get(key);
    if (consumedFood === undefined || consumedKeys.has(key)) {
      continue;
    }

    consumedKeys.add(key);
    const index = indexByPlayerId.get(consumer.playerId);
    if (index === undefined) {
      continue;
    }
    const snake = nextSnakes[index];
    if (snake === undefined) {
      continue;
    }

    const grownSegments = growSegmentsByOne(snake.segments);
    nextSnakes[index] = {
      ...snake,
      length: snake.length + 1,
      score: snake.score + SNAKE_FOOD_POINTS,
      segments: grownSegments,
    };

    const current = consumedByPlayer.get(consumer.playerId) ?? { drop: 0, normal: 0, total: 0 };
    const nextEntry = {
      drop: current.drop + (consumedFood.source === "drop" ? 1 : 0),
      normal: current.normal + (consumedFood.source === "normal" ? 1 : 0),
      total: current.total + 1,
    };
    consumedByPlayer.set(consumer.playerId, nextEntry);
  }

  if (consumedKeys.size === 0) {
    return {
      consumedByPlayer,
      foods,
      snakes: nextSnakes,
    };
  }

  return {
    consumedByPlayer,
    foods: foods.filter((food) => !consumedKeys.has(pointKey(food.point))),
    snakes: nextSnakes,
  };
}

function consumeCoins(snakes: SnakePlayerState[], coins: SnakeCoin[]): CoinConsumptionResult {
  if (coins.length === 0) {
    return {
      coins,
      consumedByPlayer: new Map(),
      snakes,
    };
  }

  const coinKeys = new Map<string, SnakeCoin>();
  for (const coin of coins) {
    const key = pointKey(coin.point);
    if (!coinKeys.has(key)) {
      coinKeys.set(key, coin);
    }
  }

  const consumedKeys = new Set<string>();
  const consumedByPlayer = new Map<string, number>();
  const nextSnakes = snakes.map((snake) => cloneSnake(snake));
  const indexByPlayerId = new Map(nextSnakes.map((snake, index) => [snake.playerId, index] as const));
  const orderedConsumers = [...nextSnakes]
    .filter((snake) => snake.alive && snake.connected && snake.head !== null)
    .sort((left, right) => left.playerId.localeCompare(right.playerId));

  for (const consumer of orderedConsumers) {
    const key = pointKey(consumer.head ?? { x: -1, y: -1 });
    const coin = coinKeys.get(key);
    if (coin === undefined || consumedKeys.has(key)) {
      continue;
    }

    consumedKeys.add(key);
    const index = indexByPlayerId.get(consumer.playerId);
    if (index === undefined) {
      continue;
    }
    const snake = nextSnakes[index];
    if (snake === undefined) {
      continue;
    }

    nextSnakes[index] = {
      ...snake,
      coinCount: snake.coinCount + coin.value,
    };
    consumedByPlayer.set(consumer.playerId, (consumedByPlayer.get(consumer.playerId) ?? 0) + coin.value);
  }

  if (consumedKeys.size === 0) {
    return {
      coins,
      consumedByPlayer,
      snakes: nextSnakes,
    };
  }

  return {
    coins: coins.filter((coin) => !consumedKeys.has(pointKey(coin.point))),
    consumedByPlayer,
    snakes: nextSnakes,
  };
}
function consumeItems(
  snakes: SnakePlayerState[],
  items: SnakeItem[],
  roundItemSettings: SnakeItemSettings,
  tickHz: number,
  activatedEffects: Set<string>,
): ItemConsumptionResult {
  if (items.length === 0) {
    return {
      activatedBoostPlayers: new Set(),
      consumedByPlayer: new Map(),
      delayTriggered: false,
      items,
      snakes,
    };
  }

  const itemByKey = new Map<string, SnakeItem>();
  for (const item of items) {
    const key = pointKey(item.point);
    if (!itemByKey.has(key)) {
      itemByKey.set(key, item);
    }
  }

  const consumedKeys = new Set<string>();
  const consumedByPlayer = new Map<string, number>();
  const activatedBoostPlayers = new Set<string>();
  const nextSnakes = snakes.map((snake) => cloneSnake(snake));
  const indexByPlayerId = new Map(nextSnakes.map((snake, index) => [snake.playerId, index] as const));
  const orderedCollectors = [...nextSnakes]
    .filter((snake) => snake.alive && snake.connected && snake.head !== null)
    .sort((left, right) => left.playerId.localeCompare(right.playerId));

  for (const collector of orderedCollectors) {
    const head = collector.head;
    if (head === null) {
      continue;
    }
    const key = pointKey(head);
    const item = itemByKey.get(key);
    if (item === undefined || consumedKeys.has(key) || !isItemTypeEnabled(item.type, roundItemSettings)) {
      continue;
    }

    consumedKeys.add(key);
    const index = indexByPlayerId.get(collector.playerId);
    if (index === undefined) {
      continue;
    }
    const snake = nextSnakes[index];
    if (snake === undefined) {
      continue;
    }

    const updatedSnake = activateEffect(snake, item.type, effectDurationTicks(item.type, tickHz));
    nextSnakes[index] = updatedSnake;
    activatedEffects.add(effectActivationKey(updatedSnake.playerId, item.type));
    if (item.type === "boost") {
      activatedBoostPlayers.add(updatedSnake.playerId);
    }
    consumedByPlayer.set(updatedSnake.playerId, (consumedByPlayer.get(updatedSnake.playerId) ?? 0) + 1);
  }

  return {
    activatedBoostPlayers,
    consumedByPlayer,
    delayTriggered: consumedKeys.size > 0,
    items: consumedKeys.size === 0 ? items : items.filter((item) => !consumedKeys.has(pointKey(item.point))),
    snakes: nextSnakes,
  };
}
function applyMagnetPull(
  snakes: SnakePlayerState[],
  foods: SnakeFood[],
  coins: SnakeCoin[],
  items: SnakeItem[],
  context: SnakeContext,
  mode: SnakeRoundMode,
): MagnetPullResult {
  const magnetSnakes = snakes
    .filter(
      (snake) =>
        snake.alive &&
        snake.connected &&
        snake.head !== null &&
        hasActiveEffect(snake, "magnet"),
    )
    .sort((left, right) => left.playerId.localeCompare(right.playerId));

  if (magnetSnakes.length === 0) {
    return {
      coinOwnersByKey: new Map(),
      coins,
      foodOwnersByKey: new Map(),
      foods,
    };
  }

  const bodyBlockedKeys = new Set<string>();
  for (const snake of snakes) {
    if (!snake.alive) {
      continue;
    }
    for (let index = 1; index < snake.segments.length; index += 1) {
      const segment = snake.segments[index];
      if (segment !== undefined) {
        bodyBlockedKeys.add(pointKey(segment));
      }
    }
  }

  const itemKeys = new Set(items.map((item) => pointKey(item.point)));
  const movedFoods: SnakeFood[] = [];
  const foodOwnersByKey = new Map<string, string>();
  const movedFoodKeys = new Set<string>();

  for (const food of foods) {
    const selected = selectMagnetOwner(food.point, magnetSnakes, context);
    if (selected === null || selected.head === null) {
      movedFoods.push(food);
      movedFoodKeys.add(pointKey(food.point));
      continue;
    }

    const pulledPoint = movePointTowards(food.point, selected.head, context);
    const pulledKey = pointKey(pulledPoint);
    const blocked =
      bodyBlockedKeys.has(pulledKey) || itemKeys.has(pulledKey) || movedFoodKeys.has(pulledKey);

    const nextPoint = blocked ? food.point : pulledPoint;
    const nextKey = pointKey(nextPoint);
    movedFoods.push(
      blocked
        ? food
        : {
            ...food,
            point: nextPoint,
          },
    );
    movedFoodKeys.add(nextKey);
    if (!foodOwnersByKey.has(nextKey)) {
      foodOwnersByKey.set(nextKey, selected.playerId);
    }
  }

  if (mode !== "coinrush" || coins.length === 0) {
    return {
      coinOwnersByKey: new Map(),
      coins,
      foodOwnersByKey,
      foods: movedFoods,
    };
  }

  const movedCoins: SnakeCoin[] = [];
  const coinOwnersByKey = new Map<string, string>();
  const movedCoinKeys = new Set<string>();

  for (const coin of coins) {
    const selected = selectMagnetOwner(coin.point, magnetSnakes, context);
    if (selected === null || selected.head === null) {
      movedCoins.push(coin);
      movedCoinKeys.add(pointKey(coin.point));
      continue;
    }

    const pulledPoint = movePointTowards(coin.point, selected.head, context);
    const pulledKey = pointKey(pulledPoint);
    const blocked =
      bodyBlockedKeys.has(pulledKey) ||
      itemKeys.has(pulledKey) ||
      movedFoodKeys.has(pulledKey) ||
      movedCoinKeys.has(pulledKey);

    const nextPoint = blocked ? coin.point : pulledPoint;
    const nextKey = pointKey(nextPoint);
    movedCoins.push(
      blocked
        ? coin
        : {
            ...coin,
            point: nextPoint,
          },
    );
    movedCoinKeys.add(nextKey);
    if (!coinOwnersByKey.has(nextKey)) {
      coinOwnersByKey.set(nextKey, selected.playerId);
    }
  }

  return {
    coinOwnersByKey,
    coins: movedCoins,
    foodOwnersByKey,
    foods: movedFoods,
  };
}

function selectMagnetOwner(
  point: SnakePoint,
  snakes: SnakePlayerState[],
  context: SnakeContext,
): SnakePlayerState | null {
  let selected: SnakePlayerState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const snake of snakes) {
    const head = snake.head;
    if (head === null) {
      continue;
    }
    const distance = toroidalManhattanDistance(point, head, context);
    if (distance > SNAKE_MAGNET_RADIUS) {
      continue;
    }
    if (
      selected === null ||
      distance < bestDistance ||
      (distance === bestDistance && snake.playerId.localeCompare(selected.playerId) < 0)
    ) {
      selected = snake;
      bestDistance = distance;
    }
  }

  return selected;
}
function consumeMagnetAdjacentCollectibles(
  snakes: SnakePlayerState[],
  foods: SnakeFood[],
  coins: SnakeCoin[],
  foodOwnersByKey: Map<string, string>,
  coinOwnersByKey: Map<string, string>,
  primed: Record<string, { coin: boolean; food: boolean }>,
  context: SnakeContext,
): MagnetAdjacencyConsumptionResult {
  const magnetOwnersById = new Map(
    snakes
      .filter(
        (snake) =>
          snake.alive &&
          snake.connected &&
          snake.head !== null &&
          hasActiveEffect(snake, "magnet"),
      )
      .map((snake) => [snake.playerId, snake] as const),
  );

  const foodCandidatesByOwner = new Map<string, SnakeFood[]>();
  for (const food of foods) {
    const ownerId = foodOwnersByKey.get(pointKey(food.point));
    if (ownerId === undefined) {
      continue;
    }
    const owner = magnetOwnersById.get(ownerId);
    if (owner === undefined || owner.head === null) {
      continue;
    }
    if (toroidalManhattanDistance(food.point, owner.head, context) > 1) {
      continue;
    }
    const candidates = foodCandidatesByOwner.get(ownerId) ?? [];
    candidates.push(food);
    foodCandidatesByOwner.set(ownerId, candidates);
  }

  const coinCandidatesByOwner = new Map<string, SnakeCoin[]>();
  for (const coin of coins) {
    const ownerId = coinOwnersByKey.get(pointKey(coin.point));
    if (ownerId === undefined) {
      continue;
    }
    const owner = magnetOwnersById.get(ownerId);
    if (owner === undefined || owner.head === null) {
      continue;
    }
    if (toroidalManhattanDistance(coin.point, owner.head, context) > 1) {
      continue;
    }
    const candidates = coinCandidatesByOwner.get(ownerId) ?? [];
    candidates.push(coin);
    coinCandidatesByOwner.set(ownerId, candidates);
  }

  const consumedFoodsByPlayer = new Map<string, { drop: number; normal: number; total: number }>();
  const consumedCoinsByPlayer = new Map<string, number>();
  const selectedFoodKeys = new Set<string>();
  const selectedCoinKeys = new Set<string>();
  const nextPrimed: Record<string, { coin: boolean; food: boolean }> = {};
  const orderedOwnerIds = [...magnetOwnersById.keys()].sort((left, right) => left.localeCompare(right));

  for (const ownerId of orderedOwnerIds) {
    const owner = magnetOwnersById.get(ownerId);
    if (owner === undefined || owner.head === null) {
      continue;
    }

    const foodCandidates = [...(foodCandidatesByOwner.get(ownerId) ?? [])].sort((left, right) => {
      const leftDistance = toroidalManhattanDistance(left.point, owner.head ?? left.point, context);
      const rightDistance = toroidalManhattanDistance(right.point, owner.head ?? right.point, context);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      const keyCompare = pointKey(left.point).localeCompare(pointKey(right.point));
      if (keyCompare !== 0) {
        return keyCompare;
      }
      return left.source.localeCompare(right.source);
    });

    let consumedFoodForOwner = false;
    if (foodCandidates.length > 0 && (primed[ownerId]?.food ?? false)) {
      const selectedFood = foodCandidates.find((candidate) => !selectedFoodKeys.has(pointKey(candidate.point)));
      if (selectedFood !== undefined) {
        consumedFoodForOwner = true;
        selectedFoodKeys.add(pointKey(selectedFood.point));
        const current = consumedFoodsByPlayer.get(ownerId) ?? { drop: 0, normal: 0, total: 0 };
        consumedFoodsByPlayer.set(ownerId, {
          drop: current.drop + (selectedFood.source === "drop" ? 1 : 0),
          normal: current.normal + (selectedFood.source === "normal" ? 1 : 0),
          total: current.total + 1,
        });
      }
    }

    const shouldPrimeFood = foodCandidates.length > 0 && (!consumedFoodForOwner || foodCandidates.length > 1);
    if (shouldPrimeFood) {
      const current = nextPrimed[ownerId] ?? { coin: false, food: false };
      nextPrimed[ownerId] = {
        ...current,
        food: true,
      };
    }

    const coinCandidates = [...(coinCandidatesByOwner.get(ownerId) ?? [])].sort((left, right) => {
      const leftDistance = toroidalManhattanDistance(left.point, owner.head ?? left.point, context);
      const rightDistance = toroidalManhattanDistance(right.point, owner.head ?? right.point, context);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      const keyCompare = pointKey(left.point).localeCompare(pointKey(right.point));
      if (keyCompare !== 0) {
        return keyCompare;
      }
      return left.value - right.value;
    });

    let consumedCoinForOwner = false;
    if (coinCandidates.length > 0 && (primed[ownerId]?.coin ?? false)) {
      const selectedCoin = coinCandidates.find((candidate) => !selectedCoinKeys.has(pointKey(candidate.point)));
      if (selectedCoin !== undefined) {
        consumedCoinForOwner = true;
        selectedCoinKeys.add(pointKey(selectedCoin.point));
        consumedCoinsByPlayer.set(ownerId, (consumedCoinsByPlayer.get(ownerId) ?? 0) + selectedCoin.value);
      }
    }

    const shouldPrimeCoin = coinCandidates.length > 0 && (!consumedCoinForOwner || coinCandidates.length > 1);
    if (shouldPrimeCoin) {
      const current = nextPrimed[ownerId] ?? { coin: false, food: false };
      nextPrimed[ownerId] = {
        ...current,
        coin: true,
      };
    }
  }

  if (selectedFoodKeys.size === 0 && selectedCoinKeys.size === 0) {
    return {
      coins,
      consumedCoinsByPlayer,
      consumedFoodsByPlayer,
      foods,
      nextPrimed,
      snakes,
    };
  }

  const nextSnakes = snakes.map((snake) => cloneSnake(snake));
  const indexByPlayerId = new Map(nextSnakes.map((snake, index) => [snake.playerId, index] as const));
  for (const [playerId, consumed] of consumedFoodsByPlayer) {
    if (consumed.total <= 0) {
      continue;
    }
    const index = indexByPlayerId.get(playerId);
    if (index === undefined) {
      continue;
    }
    const snake = nextSnakes[index];
    if (snake === undefined) {
      continue;
    }
    let grownSegments = snake.segments;
    for (let count = 0; count < consumed.total; count += 1) {
      grownSegments = growSegmentsByOne(grownSegments);
    }
    nextSnakes[index] = {
      ...snake,
      length: snake.length + consumed.total,
      score: snake.score + consumed.total * SNAKE_FOOD_POINTS,
      segments: grownSegments,
    };
  }

  for (const [playerId, value] of consumedCoinsByPlayer) {
    if (value <= 0) {
      continue;
    }
    const index = indexByPlayerId.get(playerId);
    if (index === undefined) {
      continue;
    }
    const snake = nextSnakes[index];
    if (snake === undefined) {
      continue;
    }
    nextSnakes[index] = {
      ...snake,
      coinCount: snake.coinCount + value,
    };
  }

  return {
    coins: coins.filter((coin) => !selectedCoinKeys.has(pointKey(coin.point))),
    consumedCoinsByPlayer,
    consumedFoodsByPlayer,
    foods: foods.filter((food) => !selectedFoodKeys.has(pointKey(food.point))),
    nextPrimed,
    snakes: nextSnakes,
  };
}

function respawnEligibleSnakes(
  snakes: SnakePlayerState[],
  foods: SnakeFood[],
  items: SnakeItem[],
  coins: SnakeCoin[],
  context: SnakeContext,
  tickHz: number,
): { respawnedPlayerIds: string[]; snakes: SnakePlayerState[] } {
  const nextSnakes = snakes.map((snake) => cloneSnake(snake));
  const indexByPlayerId = new Map(nextSnakes.map((snake, index) => [snake.playerId, index] as const));
  const occupiedKeys = new Set<string>();
  for (const snake of nextSnakes) {
    if (!snake.alive) {
      continue;
    }
    for (const segment of snake.segments) {
      occupiedKeys.add(pointKey(segment));
    }
  }
  for (const food of foods) {
    occupiedKeys.add(pointKey(food.point));
  }
  for (const item of items) {
    occupiedKeys.add(pointKey(item.point));
  }
  for (const coin of coins) {
    occupiedKeys.add(pointKey(coin.point));
  }

  const respawnedPlayerIds: string[] = [];
  const candidates = createSpawnCandidates(context);
  const pending = [...nextSnakes]
    .filter(
      (snake) =>
        !snake.alive &&
        snake.connected &&
        snake.respawnTicksRemaining !== null &&
        snake.respawnTicksRemaining <= 0,
    )
    .sort((left, right) => left.playerId.localeCompare(right.playerId));

  for (const snake of pending) {
    const spawn = findFirstSpawn(candidates, occupiedKeys, context, snake.playerId);
    const index = indexByPlayerId.get(snake.playerId);
    if (index === undefined) {
      continue;
    }
    const current = nextSnakes[index];
    if (current === undefined) {
      continue;
    }

    if (spawn === null) {
      nextSnakes[index] = {
        ...current,
        respawnTicksRemaining: 0,
      };
      continue;
    }

    for (const segment of spawn.segments) {
      occupiedKeys.add(pointKey(segment));
    }

    const protectionTicks = toTicks(SNAKE_SPAWN_PROTECTION_SECONDS, tickHz);
    nextSnakes[index] = {
      ...current,
      activeEffects: [],
      alive: true,
      direction: spawn.direction,
      head: clonePoint(spawn.segments[0] ?? { x: 0, y: 0 }),
      length: SNAKE_INITIAL_LENGTH,
      respawnTicksRemaining: null,
      segments: cloneSegments(spawn.segments),
      spawnProtectionTicksRemaining: protectionTicks,
      speedBank: 0,
    };
    respawnedPlayerIds.push(current.playerId);
  }

  return {
    respawnedPlayerIds,
    snakes: nextSnakes,
  };
}

function decrementRespawnTimers(snakes: SnakePlayerState[]): SnakePlayerState[] {
  return snakes.map((snake) => {
    if (snake.alive || snake.respawnTicksRemaining === null || snake.respawnTicksRemaining <= 0) {
      return snake;
    }

    return {
      ...snake,
      respawnTicksRemaining: snake.respawnTicksRemaining - 1,
    };
  });
}

function decrementProtectionAndEffects(
  snakes: SnakePlayerState[],
  activatedEffects: Set<string>,
  respawnedPlayerIds: Set<string>,
): SnakePlayerState[] {
  return snakes.map((snake) => {
    const nextProtection =
      snake.spawnProtectionTicksRemaining > 0 && !respawnedPlayerIds.has(snake.playerId)
        ? snake.spawnProtectionTicksRemaining - 1
        : snake.spawnProtectionTicksRemaining;
    const nextEffects = snake.activeEffects.flatMap((effect) => {
      if (effect.type === "shield" && effect.charges <= 0) {
        return [];
      }

      const key = effectActivationKey(snake.playerId, effect.type);
      const nextTicks = activatedEffects.has(key)
        ? effect.ticksRemaining
        : Math.max(0, effect.ticksRemaining - 1);
      if (nextTicks <= 0) {
        return [];
      }

      return [
        {
          ...effect,
          ticksRemaining: nextTicks,
        },
      ];
    });

    return {
      ...snake,
      activeEffects: nextEffects,
      spawnProtectionTicksRemaining: nextProtection,
    };
  });
}

function applySpeedBankRemainders(
  snakes: SnakePlayerState[],
  movementPlans: Map<string, MovementPlan>,
): SnakePlayerState[] {
  return snakes.map((snake) => {
    if (!snake.alive || !snake.connected) {
      if (snake.speedBank === 0) {
        return snake;
      }
      return {
        ...snake,
        speedBank: 0,
      };
    }

    const plan = movementPlans.get(snake.playerId);
    if (plan === undefined || snake.speedBank === plan.bankRemainder) {
      return snake;
    }

    return {
      ...snake,
      speedBank: plan.bankRemainder,
    };
  });
}

function placeDeathDrops(
  foods: SnakeFood[],
  deaths: SnakeDeathRecord[],
  snakes: SnakePlayerState[],
  items: SnakeItem[],
  coins: SnakeCoin[],
  context: SnakeContext,
): SnakeFood[] {
  if (deaths.length === 0) {
    return foods;
  }

  const nextFoods = cloneFoods(foods);
  const blocked = new Set<string>();
  for (const snake of snakes) {
    if (!snake.alive) {
      continue;
    }
    for (const segment of snake.segments) {
      blocked.add(pointKey(segment));
    }
  }
  for (const food of nextFoods) {
    blocked.add(pointKey(food.point));
  }
  for (const item of items) {
    blocked.add(pointKey(item.point));
  }
  for (const coin of coins) {
    blocked.add(pointKey(coin.point));
  }

  const orderedDeaths = [...deaths].sort((left, right) => left.playerId.localeCompare(right.playerId));
  for (const death of orderedDeaths) {
    const dropCount = Math.max(
      0,
      Math.floor(SNAKE_DROP_RATIO * Math.max(0, death.length - SNAKE_INITIAL_LENGTH)),
    );
    if (dropCount <= 0) {
      continue;
    }
    const candidates = buildDropCandidates(death.segments, context);
    let placed = 0;
    for (const candidate of candidates) {
      if (placed >= dropCount) {
        break;
      }
      const key = pointKey(candidate);
      if (blocked.has(key)) {
        continue;
      }
      blocked.add(key);
      nextFoods.push({
        point: candidate,
        source: "drop",
      });
      placed += 1;
    }
  }

  return nextFoods;
}

function refillFoods(
  foods: SnakeFood[],
  snakes: SnakePlayerState[],
  items: SnakeItem[],
  coins: SnakeCoin[],
  context: SnakeContext,
  respawnReservationPoints: SnakePoint[],
  tick: number,
): SnakeFood[] {
  const target = calculateFoodTarget(context.gridWidth, context.gridHeight, countAlive(snakes));
  if (foods.length >= target) {
    return foods;
  }

  const blocked = new Set<string>();
  for (const snake of snakes) {
    if (!snake.alive) {
      continue;
    }
    for (const segment of snake.segments) {
      blocked.add(pointKey(segment));
    }
  }
  for (const food of foods) {
    blocked.add(pointKey(food.point));
  }
  for (const item of items) {
    blocked.add(pointKey(item.point));
  }
  for (const coin of coins) {
    blocked.add(pointKey(coin.point));
  }
  for (const forbidden of buildSpawnForbiddenZoneKeys(context)) {
    blocked.add(forbidden);
  }
  for (const reserved of buildReservedItemCells()) {
    blocked.add(pointKey(reserved));
  }
  for (const reservation of respawnReservationPoints) {
    for (const nearby of createManhattanPoints(reservation, 2, context)) {
      blocked.add(pointKey(nearby));
    }
  }

  const nextFoods = cloneFoods(foods);
  const totalTiles = context.gridWidth * context.gridHeight;
  if (totalTiles <= 0) {
    return nextFoods;
  }
  const seed = hashString(`food:${tick}:${foods.length}`);
  const stride = resolveCoprimeStride(totalTiles, hashString(`food-stride:${tick}:${foods.length}`), Math.floor(Math.sqrt(totalTiles)));
  let scanIndex = normalizeIndex(seed, totalTiles);
  let scanned = 0;

  while (nextFoods.length < target && scanned < totalTiles) {
    const candidate = pointFromIndex(scanIndex, context);
    const key = pointKey(candidate);
    scanIndex = normalizeIndex(scanIndex + stride, totalTiles);
    scanned += 1;
    if (blocked.has(key)) {
      continue;
    }
    blocked.add(key);
    nextFoods.push({
      point: candidate,
      source: "normal",
    });
  }

  return nextFoods;
}

function refillItems(
  items: SnakeItem[],
  snakes: SnakePlayerState[],
  foods: SnakeFood[],
  coins: SnakeCoin[],
  context: SnakeContext,
  settings: SnakeItemSettings,
  cursor: number,
  typeCursor: number,
  respawnReservationPoints: SnakePoint[],
): ItemRefillResult {
  const enabledTypes = ITEM_TYPES.filter((type) => isItemTypeEnabled(type, settings));
  if (enabledTypes.length === 0) {
    return {
      items: [],
      nextCursor: cursor,
      nextTypeCursor: typeCursor,
    };
  }

  const alivePlayers = countAlive(snakes);
  const target = clampNumber(
    Math.floor(alivePlayers / 3) + 1,
    SNAKE_ITEM_TARGET_MIN,
    SNAKE_ITEM_TARGET_MAX,
  );
  if (items.length >= target) {
    return {
      items,
      nextCursor: cursor,
      nextTypeCursor: typeCursor,
    };
  }

  const blocked = new Set<string>();
  for (const snake of snakes) {
    if (!snake.alive) {
      continue;
    }
    for (const segment of snake.segments) {
      blocked.add(pointKey(segment));
    }
  }
  for (const food of foods) {
    blocked.add(pointKey(food.point));
  }
  for (const item of items) {
    blocked.add(pointKey(item.point));
  }
  for (const coin of coins) {
    blocked.add(pointKey(coin.point));
  }
  for (const reservation of respawnReservationPoints) {
    blocked.add(pointKey(reservation));
  }
  const aliveHeads = snakes
    .filter((snake) => snake.alive && snake.connected && snake.head !== null)
    .map((snake) => snake.head ?? { x: -1, y: -1 });

  const nextItems = cloneItems(items);
  const totalTiles = context.gridWidth * context.gridHeight;
  if (totalTiles <= 0) {
    return {
      items: nextItems,
      nextCursor: cursor,
      nextTypeCursor: typeCursor,
    };
  }

  const stride = resolveCoprimeStride(
    totalTiles,
    hashString(`item-stride:${context.gridWidth}:${context.gridHeight}:${enabledTypes.join("|")}`),
    Math.floor(Math.sqrt(totalTiles)),
  );
  let scanIndex = normalizeIndex(cursor, totalTiles);
  let scanned = 0;
  let nextTypeCursor = normalizeIndex(typeCursor, enabledTypes.length);

  while (nextItems.length < target && scanned < totalTiles) {
    const candidate = pointFromIndex(scanIndex, context);
    const candidateKey = pointKey(candidate);
    const nearHead = aliveHeads.some((head) => toroidalManhattanDistance(candidate, head, context) <= 1);
    scanIndex = normalizeIndex(scanIndex + stride, totalTiles);
    scanned += 1;

    if (blocked.has(candidateKey) || nearHead) {
      continue;
    }

    const itemType = enabledTypes[nextTypeCursor] ?? enabledTypes[0];
    if (itemType === undefined) {
      continue;
    }
    blocked.add(candidateKey);
    nextItems.push({
      point: candidate,
      type: itemType,
    });
    nextTypeCursor = normalizeIndex(nextTypeCursor + 1, enabledTypes.length);
  }

  return {
    items: nextItems,
    nextCursor: scanIndex,
    nextTypeCursor,
  };
}

function refillCoins(
  coins: SnakeCoin[],
  snakes: SnakePlayerState[],
  foods: SnakeFood[],
  items: SnakeItem[],
  context: SnakeContext,
  respawnReservationPoints: SnakePoint[],
  activeHotspots: SnakePoint[],
  cursor: number,
  tick: number,
): CoinRefillResult {
  if (activeHotspots.length === 0) {
    return {
      coins,
      nextCursor: cursor,
    };
  }

  const target = calculateCoinTarget(context.gridWidth, context.gridHeight, countAlive(snakes));
  if (coins.length >= target) {
    return {
      coins,
      nextCursor: cursor,
    };
  }

  const blocked = new Set<string>();
  for (const snake of snakes) {
    if (!snake.alive) {
      continue;
    }
    for (const segment of snake.segments) {
      blocked.add(pointKey(segment));
    }
  }
  for (const food of foods) {
    blocked.add(pointKey(food.point));
  }
  for (const item of items) {
    blocked.add(pointKey(item.point));
  }
  for (const coin of coins) {
    blocked.add(pointKey(coin.point));
  }
  for (const forbidden of buildSpawnForbiddenZoneKeys(context)) {
    blocked.add(forbidden);
  }
  for (const reservation of respawnReservationPoints) {
    for (const nearby of createManhattanPoints(reservation, 2, context)) {
      blocked.add(pointKey(nearby));
    }
  }

  const candidates = buildCoinSpawnCandidates(activeHotspots, context);
  if (candidates.length === 0) {
    return {
      coins,
      nextCursor: cursor,
    };
  }

  let scanIndex = normalizeIndex(cursor, candidates.length);
  let scanned = 0;
  const nextCoins = cloneCoins(coins);

  while (nextCoins.length < target && scanned < candidates.length) {
    const candidate = candidates[scanIndex];
    scanIndex = normalizeIndex(scanIndex + 1, candidates.length);
    scanned += 1;
    if (candidate === undefined) {
      continue;
    }

    const key = pointKey(candidate);
    if (blocked.has(key)) {
      continue;
    }

    const selector = hashString(`coin:${tick}:${scanIndex}:${nextCoins.length}`) % 100;
    const isNormal = selector < Math.round(SNAKE_COIN_NORMAL_RATIO * 100);
    const coinType: SnakeCoinType = isNormal ? "normal" : "gold";
    const value = coinType === "normal" ? SNAKE_COIN_NORMAL_VALUE : SNAKE_COIN_GOLD_VALUE;

    blocked.add(key);
    nextCoins.push({
      point: candidate,
      type: coinType,
      value,
    });
  }

  return {
    coins: nextCoins,
    nextCursor: scanIndex,
  };
}

function buildCoinSpawnCandidates(hotspots: SnakePoint[], context: SnakeContext): SnakePoint[] {
  const candidates: SnakePoint[] = [];
  const seen = new Set<string>();
  for (const hotspot of hotspots) {
    for (let distance = 0; distance <= SNAKE_COINRUSH_HOTSPOT_RADIUS; distance += 1) {
      for (let y = hotspot.y - distance; y <= hotspot.y + distance; y += 1) {
        for (let x = hotspot.x - distance; x <= hotspot.x + distance; x += 1) {
          const candidate = { x, y };
          if (!isInsideGrid(candidate, context)) {
            continue;
          }
          if (manhattanDistance(hotspot, candidate) !== distance) {
            continue;
          }
          const key = pointKey(candidate);
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates;
}

function advanceCoinrushState(
  current: SnakeCoinrushState | null,
  context: SnakeContext,
  tickHz: number,
): SnakeCoinrushState {
  const announceTicks = toTicks(SNAKE_COINRUSH_ANNOUNCE_SECONDS, tickHz);
  const activeTicks = toTicks(SNAKE_COINRUSH_ACTIVE_SECONDS, tickHz);

  if (current === null) {
    return createCoinrushAnnouncementState(context, 1, tickHz);
  }

  if (current.phaseTicksRemaining > 1) {
    return {
      ...current,
      phaseTicksRemaining: current.phaseTicksRemaining - 1,
    };
  }

  if (current.phase === "announce") {
    return {
      ...current,
      activeHotspots: clonePoints(current.announcedHotspots),
      announcedHotspots: [],
      phase: "active",
      phaseTicksRemaining: activeTicks,
    };
  }

  const nextWave = current.wave + 1;
  return {
    activeHotspots: [],
    announcedHotspots: resolveCoinrushHotspots(context, nextWave),
    phase: "announce",
    phaseTicksRemaining: announceTicks,
    wave: nextWave,
  };
}

function createCoinrushAnnouncementState(
  context: SnakeContext,
  wave: number,
  tickHz: number,
): SnakeCoinrushState {
  return {
    activeHotspots: [],
    announcedHotspots: resolveCoinrushHotspots(context, wave),
    phase: "announce",
    phaseTicksRemaining: toTicks(SNAKE_COINRUSH_ANNOUNCE_SECONDS, tickHz),
    wave,
  };
}

function resolveCoinrushHotspots(context: SnakeContext, wave: number): SnakePoint[] {
  const hotspots: SnakePoint[] = [];
  const seen = new Set<string>();
  const offset = normalizeIndex(wave - 1, COINRUSH_HOTSPOT_ANCHORS.length);
  const margin = Math.max(2, context.initialLength);
  const minX = margin;
  const maxX = Math.max(minX, context.gridWidth - 1 - margin);
  const minY = margin;
  const maxY = Math.max(minY, context.gridHeight - 1 - margin);

  for (let index = 0; index < SNAKE_COINRUSH_HOTSPOT_COUNT; index += 1) {
    const anchor = COINRUSH_HOTSPOT_ANCHORS[
      normalizeIndex(offset + index * 3, COINRUSH_HOTSPOT_ANCHORS.length)
    ];
    if (anchor === undefined) {
      continue;
    }
    const candidate = {
      x: clampNumber(Math.round(minX + (maxX - minX) * anchor.x), minX, maxX),
      y: clampNumber(Math.round(minY + (maxY - minY) * anchor.y), minY, maxY),
    };
    const key = pointKey(candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hotspots.push(candidate);
  }

  let fillCursor = offset;
  while (hotspots.length < SNAKE_COINRUSH_HOTSPOT_COUNT) {
    const fallback = pointFromIndex(fillCursor * 11 + wave, context);
    fillCursor += 1;
    const key = pointKey(fallback);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hotspots.push(fallback);
  }

  return hotspots;
}

function buildRespawnReservationPoints(
  snakes: SnakePlayerState[],
  foods: SnakeFood[],
  items: SnakeItem[],
  coins: SnakeCoin[],
  context: SnakeContext,
): SnakePoint[] {
  const occupied = new Set<string>();
  for (const snake of snakes) {
    if (!snake.alive) {
      continue;
    }
    for (const segment of snake.segments) {
      occupied.add(pointKey(segment));
    }
  }
  for (const food of foods) {
    occupied.add(pointKey(food.point));
  }
  for (const item of items) {
    occupied.add(pointKey(item.point));
  }
  for (const coin of coins) {
    occupied.add(pointKey(coin.point));
  }

  const reservations: SnakePoint[] = [];
  const candidates = createSpawnCandidates(context);
  const pending = [...snakes]
    .filter((snake) => !snake.alive && snake.connected && snake.respawnTicksRemaining !== null)
    .sort((left, right) => left.playerId.localeCompare(right.playerId));

  for (const snake of pending) {
    const spawn = findFirstSpawn(candidates, occupied, context, snake.playerId);
    if (spawn === null) {
      continue;
    }
    const head = spawn.segments[0];
    if (head === undefined) {
      continue;
    }
    reservations.push(clonePoint(head));
    for (const segment of spawn.segments) {
      occupied.add(pointKey(segment));
    }
  }

  return reservations;
}

function startRound(
  state: SnakeEngineState,
  players: GamePlayerSnapshot[],
  context: SnakeContext,
): SnakeEngineState {
  const lobbySeedState: SnakeEngineState = {
    ...state,
    publicState: {
      ...state.publicState,
      stage: "lobby",
    },
  };
  const syncedLobby = syncPlayers(lobbySeedState, players, context);
  const connectedPlayers = players.filter((player) => player.connected);
  const connectedCount = connectedPlayers.length;

  if (connectedCount < SNAKE_MIN_ROUND_PLAYERS || connectedCount > SNAKE_MAX_ROUND_PLAYERS) {
    return {
      ...syncedLobby,
      magnetAdjacencyPrimed: {},
      pendingDirections: {},
      publicState: {
        ...syncedLobby.publicState,
        latestMessage:
          connectedCount < SNAKE_MIN_ROUND_PLAYERS
            ? `Need at least ${SNAKE_MIN_ROUND_PLAYERS} connected players to start.`
            : `Snake supports up to ${SNAKE_MAX_ROUND_PLAYERS} players.`,
      },
    };
  }

  const roundGrid = resolveRoundGridDimensions(connectedCount);
  const roundContext = buildEffectiveContext(context, roundGrid.width, roundGrid.height);
  const occupied = new Set<string>();
  const candidates = createSpawnCandidates(roundContext);

  const spawnedSnakes = syncedLobby.publicState.snakes.map((snake) => {
    if (!snake.connected) {
      return {
        ...resetSnakeForRound(snake, roundContext.initialLength),
        coinCount: 0,
        score: 0,
      };
    }
    const spawn = findFirstSpawn(candidates, occupied, roundContext, snake.playerId, state.spawnEpoch);
    if (spawn === null) {
      return {
        ...resetSnakeForRound(snake, roundContext.initialLength),
        coinCount: 0,
        score: 0,
      };
    }
    for (const segment of spawn.segments) {
      occupied.add(pointKey(segment));
    }
    return {
      ...snake,
      activeEffects: [],
      alive: true,
      coinCount: 0,
      direction: spawn.direction,
      head: clonePoint(spawn.segments[0] ?? { x: 0, y: 0 }),
      length: roundContext.initialLength,
      respawnTicksRemaining: null,
      score: 0,
      segments: cloneSegments(spawn.segments),
      spawnProtectionTicksRemaining: 0,
      speedBank: 0,
    };
  });

  const countdownTicks = toTicks(SNAKE_COUNTDOWN_SECONDS, context.tickHz);
  const countdownRemaining = Math.max(1, Math.ceil(countdownTicks / context.tickHz));
  const roundItemSettings = cloneItemSettings(syncedLobby.publicState.itemSettings);

  return {
    ...syncedLobby,
    coinSpawnCursor: 0,
    countdownTicksRemaining: countdownTicks,
    itemRespawnDelayTicksRemaining: 0,
    itemSpawnCursor: 0,
    magnetAdjacencyPrimed: {},
    pendingDirections: {},
    publicState: {
      ...syncedLobby.publicState,
      aliveCount: countAlive(spawnedSnakes),
      coinrush: null,
      coins: [],
      countdownRemaining,
      foods: [],
      grid: {
        height: roundContext.gridHeight,
        width: roundContext.gridWidth,
      },
      items: [],
      latestMessage: `Round starts in ${countdownRemaining}...`,
      roundSecondsRemaining: null,
      secretQuestLive: null,
      secretQuestRoundSummary: null,
      showIdentityLabels: true,
      snakes: spawnedSnakes,
      stage: "countdown",
      tick: 0,
      winnerPlayerId: null,
      winnerTeam: null,
    },
    roundItemSettings,
    roundModeFrozen: syncedLobby.publicState.roundMode,
    roundQuestAssignments: {},
    roundQuestMeta: cloneSecretQuestMeta(state.roundQuestMeta),
    roundSecretQuestEnabled: false,
    roundTicksRemaining: null,
  };
}

function markReconnect(state: SnakeEngineState, playerId: string): SnakeEngineState {
  if (state.publicState.stage !== "running") {
    return state;
  }
  const snake = state.publicState.snakes.find((candidate) => candidate.playerId === playerId);
  if (
    snake === undefined ||
    !snake.connected ||
    snake.alive ||
    snake.respawnTicksRemaining === null
  ) {
    return state;
  }

  return {
    ...state,
    publicState: {
      ...state.publicState,
      latestMessage: `${snake.name} reconnected. Respawn pending.`,
    },
  };
}

function queueDirection(
  state: SnakeEngineState,
  event: Extract<SnakeEvent, { type: "direction_received" }>,
): SnakeEngineState {
  if (state.publicState.stage !== "running" && state.publicState.stage !== "countdown") {
    return state;
  }

  const snake = state.publicState.snakes.find((candidate) => candidate.playerId === event.playerId);
  if (snake === undefined || !snake.connected || !snake.alive) {
    return state;
  }

  return {
    ...state,
    pendingDirections: {
      ...state.pendingDirections,
      [event.playerId]: event.dir,
    },
  };
}

function stopRound(
  state: SnakeEngineState,
  players: GamePlayerSnapshot[],
  context: SnakeContext,
): SnakeEngineState {
  const nextSpawnEpoch = state.spawnEpoch + 1;
  const lobbyGrid = resolveLobbyGridDimensions(players.filter((player) => player.connected).length);
  const lobbyContext = buildEffectiveContext(context, lobbyGrid.width, lobbyGrid.height);
  const mappedSnakes = mapPlayersToSnakeState(state.publicState.snakes, players, lobbyContext).map((snake) => ({
    ...resetSnakeForRound(snake, lobbyContext.initialLength),
    coinCount: 0,
    score: 0,
  }));
  const lobbySnakes = placeLobbySnakes(mappedSnakes, lobbyContext, nextSpawnEpoch);

  return {
    ...state,
    coinSpawnCursor: 0,
    countdownTicksRemaining: null,
    itemRespawnDelayTicksRemaining: 0,
    itemSpawnCursor: 0,
    magnetAdjacencyPrimed: {},
    pendingDirections: {},
    publicState: {
      ...state.publicState,
      aliveCount: countAlive(lobbySnakes),
      coinrush: null,
      coins: [],
      countdownRemaining: null,
      foods: [],
      grid: {
        height: lobbyContext.gridHeight,
        width: lobbyContext.gridWidth,
      },
      items: [],
      latestMessage: "Round stopped by host.",
      roundSecondsRemaining: null,
      secretQuestLive: null,
      secretQuestRoundSummary: null,
      showIdentityLabels: true,
      snakes: lobbySnakes,
      stage: "lobby",
      tick: 0,
      winnerPlayerId: null,
      winnerTeam: null,
    },
    roundItemSettings: cloneItemSettings(state.publicState.itemSettings),
    roundModeFrozen: state.publicState.roundMode,
    roundQuestAssignments: {},
    roundQuestMeta: cloneSecretQuestMeta(state.roundQuestMeta),
    roundSecretQuestEnabled: false,
    roundTicksRemaining: null,
    spawnEpoch: nextSpawnEpoch,
  };
}

function syncPlayers(
  state: SnakeEngineState,
  players: GamePlayerSnapshot[],
  context: SnakeContext,
): SnakeEngineState {
  const stage = state.publicState.stage;
  if (stage === "lobby") {
    const lobbyGrid = resolveLobbyGridDimensions(players.filter((player) => player.connected).length);
    const lobbyContext = buildEffectiveContext(context, lobbyGrid.width, lobbyGrid.height);
    const mappedSnakes = mapPlayersToSnakeState(state.publicState.snakes, players, lobbyContext);
    const snakes = placeLobbySnakes(mappedSnakes, lobbyContext, state.spawnEpoch);
    const activePlayerIds = new Set(snakes.map((snake) => snake.playerId));
    const nextPendingDirections = Object.fromEntries(
      Object.entries(state.pendingDirections).filter(([playerId]) => activePlayerIds.has(playerId)),
    );
    return {
      ...state,
      pendingDirections: nextPendingDirections,
      publicState: {
        ...state.publicState,
        aliveCount: countAlive(snakes),
        grid: {
          height: lobbyContext.gridHeight,
          width: lobbyContext.gridWidth,
        },
        latestMessage: buildLobbyMessage(players),
        secretQuestLive: null,
        secretQuestRoundSummary: null,
        showIdentityLabels: true,
        snakes,
      },
    };
  }

  const playersById = new Map(players.map((player) => [player.playerId, player] as const));
  const snakes = state.publicState.snakes.map((snake) => {
    const player = playersById.get(snake.playerId);
    if (player === undefined) {
      return {
        ...snake,
        connected: false,
      };
    }

    if (!player.connected) {
      if (!snake.alive && snake.respawnTicksRemaining !== null) {
        return {
          ...snake,
          connected: false,
          name: player.name,
          team: player.team,
        };
      }

      const nextRespawn = snake.alive
        ? toTicks(SNAKE_RESPAWN_SECONDS, context.tickHz)
        : snake.respawnTicksRemaining;
      return {
        ...snake,
        activeEffects: [],
        alive: false,
        connected: false,
        head: null,
        name: player.name,
        respawnTicksRemaining: nextRespawn,
        segments: [],
        spawnProtectionTicksRemaining: 0,
        speedBank: 0,
        team: player.team,
      };
    }

    return {
      ...snake,
      connected: true,
      head: snake.head === null ? null : clonePoint(snake.head),
      name: player.name,
      segments: cloneSegments(snake.segments),
      team: player.team,
    };
  });

  const activePlayerIds = new Set(snakes.map((snake) => snake.playerId));
  const nextPendingDirections = Object.fromEntries(
    Object.entries(state.pendingDirections).filter(([playerId]) => activePlayerIds.has(playerId)),
  );

  return {
    ...state,
    pendingDirections: nextPendingDirections,
    publicState: {
      ...state.publicState,
      aliveCount: countAlive(snakes),
      snakes,
    },
  };
}

function mapPlayersToSnakeState(
  currentSnakes: SnakePlayerState[],
  players: GamePlayerSnapshot[],
  context: SnakeContext,
): SnakePlayerState[] {
  const previousByPlayerId = new Map(currentSnakes.map((snake) => [snake.playerId, snake] as const));
  const orderedPlayers = [...players].sort((left, right) => {
    const nameOrder = left.name.localeCompare(right.name);
    return nameOrder !== 0 ? nameOrder : left.playerId.localeCompare(right.playerId);
  });

  return orderedPlayers.map((player, index) => {
    const previous = previousByPlayerId.get(player.playerId);
    return createSpectatorSnake(player, index, context, previous);
  });
}

function placeLobbySnakes(
  snakes: SnakePlayerState[],
  context: SnakeContext,
  spawnEpoch: number,
): SnakePlayerState[] {
  const occupied = new Set<string>();
  const candidates = createSpawnCandidates(context);

  return snakes.map((snake) => {
    if (!snake.connected) {
      return resetSnakeForRound(snake, context.initialLength);
    }

    const spawn = findFirstSpawn(candidates, occupied, context, snake.playerId, spawnEpoch);
    if (spawn === null) {
      return resetSnakeForRound(snake, context.initialLength);
    }

    for (const segment of spawn.segments) {
      occupied.add(pointKey(segment));
    }

    return {
      ...snake,
      activeEffects: [],
      alive: true,
      direction: spawn.direction,
      head: clonePoint(spawn.segments[0] ?? { x: 0, y: 0 }),
      length: context.initialLength,
      respawnTicksRemaining: null,
      segments: cloneSegments(spawn.segments),
      spawnProtectionTicksRemaining: 0,
      speedBank: 0,
    };
  });
}

function createSpawnCandidates(context: SnakeContext): SpawnCandidate[] {
  const candidates: SpawnCandidate[] = [];
  const margin = Math.max(2, context.initialLength);
  const minX = margin;
  const maxX = Math.max(minX, context.gridWidth - 1 - margin);
  const minY = margin;
  const maxY = Math.max(minY, context.gridHeight - 1 - margin);

  for (const anchor of SPAWN_EDGE_ANCHORS) {
    const y = clampNumber(Math.round(minY + (maxY - minY) * anchor), minY, maxY);
    candidates.push(createSpawnCandidate(minX, y, "right", context.initialLength));
    candidates.push(createSpawnCandidate(maxX, y, "left", context.initialLength));
  }

  for (const anchor of SPAWN_EDGE_ANCHORS) {
    const x = clampNumber(Math.round(minX + (maxX - minX) * anchor), minX, maxX);
    candidates.push(createSpawnCandidate(x, minY, "down", context.initialLength));
    candidates.push(createSpawnCandidate(x, maxY, "up", context.initialLength));
  }

  return uniqueSpawnCandidates(candidates);
}

function uniqueSpawnCandidates(candidates: SpawnCandidate[]): SpawnCandidate[] {
  const seen = new Set<string>();
  const unique: SpawnCandidate[] = [];
  for (const candidate of candidates) {
    const head = candidate.segments[0];
    if (head === undefined) {
      continue;
    }
    const key = `${pointKey(head)}:${candidate.direction}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
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

function findFirstSpawn(
  candidates: SpawnCandidate[],
  occupied: Set<string>,
  context: SnakeContext,
  playerId: string,
  seedOffset = 0,
): SpawnCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const offset = normalizeIndex(hashString(playerId) + seedOffset, candidates.length);
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[(index + offset) % candidates.length];
    if (candidate === undefined) {
      continue;
    }
    if (!candidateIsSafe(candidate, occupied, context)) {
      continue;
    }
    return {
      direction: candidate.direction,
      segments: cloneSegments(candidate.segments),
    };
  }

  return null;
}

function candidateIsSafe(candidate: SpawnCandidate, occupied: Set<string>, context: SnakeContext): boolean {
  return candidate.segments.every(
    (segment) => isInsideGrid(segment, context) && !occupied.has(pointKey(segment)),
  );
}

function resolveWinnerByScore(snakes: SnakePlayerState[]): { topValue: number; winner: SnakePlayerState | null } {
  let topScore = 0;
  for (const snake of snakes) {
    if (snake.score > topScore) {
      topScore = snake.score;
    }
  }
  const leaders = snakes.filter((snake) => snake.score === topScore);
  if (leaders.length !== 1) {
    return {
      topValue: topScore,
      winner: null,
    };
  }
  return {
    topValue: topScore,
    winner: leaders[0] ?? null,
  };
}

function resolveWinnerByCoins(snakes: SnakePlayerState[]): { topValue: number; winner: SnakePlayerState | null } {
  let topCoins = 0;
  for (const snake of snakes) {
    if (snake.coinCount > topCoins) {
      topCoins = snake.coinCount;
    }
  }
  const leaders = snakes.filter((snake) => snake.coinCount === topCoins);
  if (leaders.length !== 1) {
    return {
      topValue: topCoins,
      winner: null,
    };
  }

  return {
    topValue: topCoins,
    winner: leaders[0] ?? null,
  };
}

function createSpectatorSnake(
  player: GamePlayerSnapshot,
  index: number,
  context: SnakeContext,
  previous?: SnakePlayerState,
): SnakePlayerState {
  const direction = previous?.direction ?? DEFAULT_DIRECTIONS[index % DEFAULT_DIRECTIONS.length] ?? "right";

  return {
    activeEffects: previous?.activeEffects.map((effect) => ({ ...effect })) ?? [],
    alive: previous?.alive ?? false,
    coinCount: previous?.coinCount ?? 0,
    color: previous?.color ?? SNAKE_COLORS[index % SNAKE_COLORS.length] ?? SNAKE_COLORS[0],
    connected: player.connected,
    direction,
    head: previous?.head !== undefined && previous.head !== null ? clonePoint(previous.head) : null,
    length: previous?.length ?? context.initialLength,
    name: player.name,
    playerId: player.playerId,
    respawnTicksRemaining: previous?.respawnTicksRemaining ?? null,
    score: previous?.score ?? 0,
    segments: previous?.segments !== undefined ? cloneSegments(previous.segments) : [],
    spawnProtectionTicksRemaining: previous?.spawnProtectionTicksRemaining ?? 0,
    speedBank: previous?.speedBank ?? 0,
    team: player.team,
    wins: previous?.wins ?? 0,
  };
}

function resolveLobbyGridDimensions(connectedPlayers: number): { height: number; width: number } {
  const clamped = clampNumber(connectedPlayers, SNAKE_MIN_ROUND_PLAYERS, SNAKE_MAX_ROUND_PLAYERS);
  const preset = SNAKE_GRID_PRESETS[clamped];
  return {
    height: preset?.gridHeight ?? SNAKE_DEFAULT_GRID_HEIGHT,
    width: preset?.gridWidth ?? SNAKE_DEFAULT_GRID_WIDTH,
  };
}

function resolveRoundGridDimensions(connectedPlayers: number): { height: number; width: number } {
  const clamped = clampNumber(connectedPlayers, SNAKE_MIN_ROUND_PLAYERS, SNAKE_MAX_ROUND_PLAYERS);
  const preset = SNAKE_GRID_PRESETS[clamped];
  return {
    height: preset?.gridHeight ?? SNAKE_DEFAULT_GRID_HEIGHT,
    width: preset?.gridWidth ?? SNAKE_DEFAULT_GRID_WIDTH,
  };
}

function buildEffectiveContext(base: SnakeContext, gridWidth: number, gridHeight: number): SnakeContext {
  return {
    ...base,
    gridHeight,
    gridWidth,
  };
}

function buildEffectiveContextFromStateGrid(base: SnakeContext, state: SnakeState): SnakeContext {
  return buildEffectiveContext(base, state.grid.width, state.grid.height);
}

function createDefaultItemSettings(): SnakeItemSettings {
  return {
    boost: true,
    magnet: true,
    shield: true,
  };
}

function cloneItemSettings(settings: SnakeItemSettings): SnakeItemSettings {
  return {
    boost: settings.boost,
    magnet: settings.magnet,
    shield: settings.shield,
  };
}

function createDefaultSecretQuestSettings(): SnakeSecretQuestSettings {
  return {
    enabled: false,
  };
}

function createInitialSecretQuestMeta(): SnakeSecretQuestMetaInternal {
  return {
    roundCounter: 0,
    waveFirstToThreeByWave: {},
  };
}

function cloneSecretQuestMeta(meta: SnakeSecretQuestMetaInternal): SnakeSecretQuestMetaInternal {
  return {
    roundCounter: meta.roundCounter,
    waveFirstToThreeByWave: { ...meta.waveFirstToThreeByWave },
  };
}

function createDefaultSecretQuestProgress(): SnakeSecretQuestProgressInternal {
  return {
    deathCountTotal: 0,
    dropFoodCount: 0,
    foodStreak: 0,
    killCount: 0,
    surviveNoItemTicks: 0,
    wrapCount: 0,
  };
}

function cloneSecretQuestAssignments(
  assignments: Record<string, SnakeSecretQuestAssignmentInternal>,
): Record<string, SnakeSecretQuestAssignmentInternal> {
  return Object.fromEntries(
    Object.entries(assignments).map(([playerId, assignment]) => [
      playerId,
      {
        ...assignment,
        progress: {
          ...assignment.progress,
        },
      },
    ]),
  );
}

function resolveSecretQuestPool(connectedPlayers: number): SnakeSecretQuestType[] {
  return connectedPlayers <= 3 ? SNAKE_SECRET_QUEST_POOL_LOW : SNAKE_SECRET_QUEST_POOL_HIGH;
}

function isSecretQuestEligible(
  _questType: SnakeSecretQuestType,
  _roundMode: SnakeRoundMode,
  _itemSettings: SnakeItemSettings,
): boolean {
  return true;
}

function assignSecretQuestsForRound(
  snakes: SnakePlayerState[],
  roundMode: SnakeRoundMode,
  itemSettings: SnakeItemSettings,
  roundCounter: number,
): Record<string, SnakeSecretQuestAssignmentInternal> {
  const connectedPlayers = snakes.filter((snake) => snake.connected).length;
  const pool = resolveSecretQuestPool(connectedPlayers).filter((questType) =>
    isSecretQuestEligible(questType, roundMode, itemSettings),
  );
  if (pool.length === 0) {
    return {};
  }

  const orderedPlayerIds = snakes
    .filter((snake) => snake.connected)
    .map((snake) => snake.playerId)
    .sort((left, right) => left.localeCompare(right));
  const rotation = normalizeIndex(roundCounter - 1, pool.length);

  return Object.fromEntries(
    orderedPlayerIds.map((playerId, index) => {
      const questType = pool[normalizeIndex(rotation + index, pool.length)] ?? pool[0] ?? "wrap_8";
      return [
        playerId,
        {
          bonusAwarded: false,
          completed: false,
          failed: false,
          playerId,
          progress: createDefaultSecretQuestProgress(),
          questType,
        },
      ];
    }),
  );
}

function createEmptyQuestSignal(
  connected: boolean,
  alive: boolean,
  score: number,
): SnakeSecretQuestPlayerSignal {
  return {
    alive,
    boostActivated: false,
    coinCollected: 0,
    connected,
    deathCount: 0,
    dropFoodCollected: 0,
    foodCollected: 0,
    itemCollected: 0,
    killCount: 0,
    scoreAfter: score,
    scoreBefore: score,
    wave: null,
    wraps: 0,
  };
}

function createQuestSignalFrame(snakes: SnakePlayerState[]): SnakeQuestSignalFrame {
  const playerOrder = snakes
    .map((snake) => snake.playerId)
    .sort((left, right) => left.localeCompare(right));
  const byPlayerId: Record<string, SnakeSecretQuestPlayerSignal> = {};
  const byId = new Map(snakes.map((snake) => [snake.playerId, snake] as const));

  for (const playerId of playerOrder) {
    const snake = byId.get(playerId);
    byPlayerId[playerId] = createEmptyQuestSignal(
      snake?.connected ?? false,
      snake?.alive ?? false,
      snake?.score ?? 0,
    );
  }

  return {
    byPlayerId,
    playerOrder,
  };
}

function ensureQuestSignal(frame: SnakeQuestSignalFrame, playerId: string): SnakeSecretQuestPlayerSignal {
  const existing = frame.byPlayerId[playerId];
  if (existing !== undefined) {
    return existing;
  }

  const signal = createEmptyQuestSignal(false, false, 0);
  frame.byPlayerId[playerId] = signal;
  if (!frame.playerOrder.includes(playerId)) {
    frame.playerOrder.push(playerId);
    frame.playerOrder.sort((left, right) => left.localeCompare(right));
  }
  return signal;
}

function recordSubstepQuestSignals(frame: SnakeQuestSignalFrame, substep: SubstepResolution): void {
  for (const [playerId, wraps] of substep.wrapsByPlayer) {
    if (wraps <= 0) {
      continue;
    }
    const signal = ensureQuestSignal(frame, playerId);
    signal.wraps += wraps;
  }

  for (const death of substep.deaths) {
    const signal = ensureQuestSignal(frame, death.playerId);
    signal.deathCount += 1;
  }

  for (const [playerId, points] of substep.killPoints) {
    if (points <= 0) {
      continue;
    }
    const signal = ensureQuestSignal(frame, playerId);
    signal.killCount += Math.max(1, Math.floor(points / Math.max(1, SNAKE_KILL_POINTS)));
  }
}

function recordFoodQuestSignals(
  frame: SnakeQuestSignalFrame,
  consumedByPlayer: Map<string, { drop: number; normal: number; total: number }>,
): void {
  for (const [playerId, consumed] of consumedByPlayer) {
    if (consumed.total <= 0) {
      continue;
    }
    const signal = ensureQuestSignal(frame, playerId);
    signal.dropFoodCollected += consumed.drop;
    signal.foodCollected += consumed.total;
  }
}

function recordCoinQuestSignals(
  frame: SnakeQuestSignalFrame,
  consumedByPlayer: Map<string, number>,
  wave: number | null,
): void {
  for (const [playerId, amount] of consumedByPlayer) {
    if (amount <= 0) {
      continue;
    }
    const signal = ensureQuestSignal(frame, playerId);
    signal.coinCollected += amount;
    signal.wave = wave;
  }
}

function recordItemQuestSignals(
  frame: SnakeQuestSignalFrame,
  consumedByPlayer: Map<string, number>,
  activatedBoostPlayers: Set<string>,
): void {
  for (const [playerId, count] of consumedByPlayer) {
    if (count <= 0) {
      continue;
    }
    const signal = ensureQuestSignal(frame, playerId);
    signal.itemCollected += count;
  }

  for (const playerId of activatedBoostPlayers) {
    const signal = ensureQuestSignal(frame, playerId);
    signal.boostActivated = true;
  }
}

function finalizeQuestSignalFrame(frame: SnakeQuestSignalFrame, snakes: SnakePlayerState[]): void {
  const byId = new Map(snakes.map((snake) => [snake.playerId, snake] as const));
  for (const playerId of frame.playerOrder) {
    const signal = ensureQuestSignal(frame, playerId);
    const snake = byId.get(playerId);
    if (snake === undefined) {
      signal.alive = false;
      signal.connected = false;
      signal.scoreAfter = signal.scoreBefore;
      continue;
    }

    signal.alive = snake.alive;
    signal.connected = snake.connected;
    signal.scoreAfter = snake.score;
  }
}

function advanceSecretQuests(
  assignments: Record<string, SnakeSecretQuestAssignmentInternal>,
  meta: SnakeSecretQuestMetaInternal,
  frame: SnakeQuestSignalFrame,
  snakes: SnakePlayerState[],
  tickHz: number,
): SecretQuestEvaluationResult {
  const nextAssignments = cloneSecretQuestAssignments(assignments);
  const nextMeta = cloneSecretQuestMeta(meta);
  const nextSnakes = snakes.map((snake) => cloneSnake(snake));
  const snakeIndexByPlayerId = new Map(nextSnakes.map((snake, index) => [snake.playerId, index] as const));

  for (const playerId of Object.keys(nextAssignments).sort((left, right) => left.localeCompare(right))) {
    const assignment = nextAssignments[playerId];
    if (assignment === undefined) {
      continue;
    }

    const signal = ensureQuestSignal(frame, playerId);
    const progress = {
      ...assignment.progress,
    };

    if (!assignment.completed && !assignment.failed) {
      switch (assignment.questType) {
        case "deaths_max_5_round": {
          if (signal.connected) {
            progress.deathCountTotal += signal.deathCount;
          }
          if (progress.deathCountTotal > SNAKE_SECRET_QUEST_DEATHS_MAX) {
            assignment.failed = true;
          }
          break;
        }
        case "food_streak_6_no_death": {
          if (signal.deathCount > 0) {
            progress.foodStreak = 0;
          }
          if (signal.connected) {
            progress.foodStreak += signal.foodCollected;
          }
          if (progress.foodStreak >= SNAKE_SECRET_QUEST_FOOD_STREAK_TARGET) {
            assignment.completed = true;
          }
          break;
        }
        case "kills_6": {
          if (signal.connected) {
            progress.killCount += signal.killCount;
          }
          if (progress.killCount >= SNAKE_SECRET_QUEST_KILLS_TARGET) {
            assignment.completed = true;
          }
          break;
        }
        case "drop_food_6": {
          if (signal.connected) {
            progress.dropFoodCount += signal.dropFoodCollected;
          }
          if (progress.dropFoodCount >= SNAKE_SECRET_QUEST_DROP_FOOD_TARGET) {
            assignment.completed = true;
          }
          break;
        }
        case "wrap_8": {
          if (signal.connected) {
            progress.wrapCount += signal.wraps;
          }
          if (progress.wrapCount >= SNAKE_SECRET_QUEST_WRAP_TARGET) {
            assignment.completed = true;
          }
          break;
        }
        case "survive_30s_no_item": {
          const resetStreak =
            !signal.connected || !signal.alive || signal.deathCount > 0 || signal.itemCollected > 0;
          progress.surviveNoItemTicks = resetStreak ? 0 : progress.surviveNoItemTicks + 1;
          if (
            progress.surviveNoItemTicks >=
            toTicks(SNAKE_SECRET_QUEST_SURVIVE_NO_ITEM_SECONDS, tickHz)
          ) {
            assignment.completed = true;
          }
          break;
        }
        default:
          break;
      }
    }

    assignment.progress = progress;
    applySecretQuestBonusIfNeeded(assignment, snakeIndexByPlayerId, nextSnakes);
    nextAssignments[playerId] = assignment;
  }

  return {
    assignments: nextAssignments,
    meta: nextMeta,
    snakes: nextSnakes,
  };
}

function applySecretQuestBonusIfNeeded(
  assignment: SnakeSecretQuestAssignmentInternal,
  snakeIndexByPlayerId: Map<string, number>,
  snakes: SnakePlayerState[],
): void {
  if (!assignment.completed || assignment.bonusAwarded) {
    return;
  }

  const snakeIndex = snakeIndexByPlayerId.get(assignment.playerId);
  if (snakeIndex !== undefined) {
    const snake = snakes[snakeIndex];
    if (snake !== undefined) {
      snakes[snakeIndex] = {
        ...snake,
        score: snake.score + SNAKE_SECRET_QUEST_BONUS_POINTS,
      };
    }
  }

  assignment.bonusAwarded = true;
}

function finalizeRoundEndSecretQuests(
  assignments: Record<string, SnakeSecretQuestAssignmentInternal>,
  snakes: SnakePlayerState[],
): {
  assignments: Record<string, SnakeSecretQuestAssignmentInternal>;
  snakes: SnakePlayerState[];
} {
  const nextAssignments = cloneSecretQuestAssignments(assignments);
  const nextSnakes = snakes.map((snake) => cloneSnake(snake));
  const snakeIndexByPlayerId = new Map(nextSnakes.map((snake, index) => [snake.playerId, index] as const));

  for (const playerId of Object.keys(nextAssignments).sort((left, right) => left.localeCompare(right))) {
    const assignment = nextAssignments[playerId];
    if (assignment === undefined) {
      continue;
    }

    if (
      assignment.questType === "deaths_max_5_round" &&
      !assignment.failed &&
      !assignment.completed
    ) {
      assignment.completed = true;
    }

    applySecretQuestBonusIfNeeded(assignment, snakeIndexByPlayerId, nextSnakes);
    nextAssignments[playerId] = assignment;
  }

  return {
    assignments: nextAssignments,
    snakes: nextSnakes,
  };
}

function buildSecretQuestLive(
  assignments: Record<string, SnakeSecretQuestAssignmentInternal>,
  tickHz: number,
): SnakeSecretQuestLiveEntry[] | null {
  const entries = Object.values(assignments)
    .sort((left, right) => left.playerId.localeCompare(right.playerId))
    .map((assignment) => ({
      playerId: assignment.playerId,
      progressCurrent: resolveSecretQuestLiveCurrent(assignment),
      progressTarget: resolveSecretQuestLiveTarget(assignment, tickHz),
      questType: assignment.questType,
      status: resolveSecretQuestLiveStatus(assignment),
    }));

  return entries.length === 0 ? null : entries;
}

function resolveSecretQuestLiveCurrent(assignment: SnakeSecretQuestAssignmentInternal): number {
  switch (assignment.questType) {
    case "deaths_max_5_round":
      return assignment.progress.deathCountTotal;
    case "food_streak_6_no_death":
      return assignment.progress.foodStreak;
    case "kills_6":
      return assignment.progress.killCount;
    case "drop_food_6":
      return assignment.progress.dropFoodCount;
    case "wrap_8":
      return assignment.progress.wrapCount;
    case "survive_30s_no_item":
      return assignment.progress.surviveNoItemTicks;
    default:
      return 0;
  }
}

function resolveSecretQuestLiveTarget(
  assignment: SnakeSecretQuestAssignmentInternal,
  tickHz: number,
): number {
  switch (assignment.questType) {
    case "deaths_max_5_round":
      return SNAKE_SECRET_QUEST_DEATHS_MAX;
    case "food_streak_6_no_death":
      return SNAKE_SECRET_QUEST_FOOD_STREAK_TARGET;
    case "kills_6":
      return SNAKE_SECRET_QUEST_KILLS_TARGET;
    case "drop_food_6":
      return SNAKE_SECRET_QUEST_DROP_FOOD_TARGET;
    case "wrap_8":
      return SNAKE_SECRET_QUEST_WRAP_TARGET;
    case "survive_30s_no_item":
      return toTicks(SNAKE_SECRET_QUEST_SURVIVE_NO_ITEM_SECONDS, tickHz);
    default:
      return 0;
  }
}

function resolveSecretQuestLiveStatus(
  assignment: SnakeSecretQuestAssignmentInternal,
): SnakeSecretQuestLiveStatus {
  if (assignment.failed) {
    return "failed";
  }
  if (assignment.completed) {
    return "completed";
  }
  return "active";
}

function buildSecretQuestRoundSummary(
  assignments: Record<string, SnakeSecretQuestAssignmentInternal>,
): SnakeSecretQuestRoundSummaryEntry[] | null {
  const entries = Object.values(assignments)
    .sort((left, right) => left.playerId.localeCompare(right.playerId))
    .map((assignment) => ({
      bonusAwarded: assignment.bonusAwarded,
      completed: assignment.completed,
      failed: assignment.failed,
      playerId: assignment.playerId,
      questType: assignment.questType,
    }));

  return entries.length === 0 ? null : entries;
}

function buildDropCandidates(segments: SnakePoint[], context: SnakeContext): SnakePoint[] {
  const offsets: SnakePoint[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  const result: SnakePoint[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    for (const offset of offsets) {
      const candidate = wrapPoint({ x: segment.x + offset.x, y: segment.y + offset.y }, context);
      const key = pointKey(candidate);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(candidate);
    }
  }

  return result;
}

function buildSpawnForbiddenZoneKeys(context: SnakeContext): Set<string> {
  const forbidden = new Set<string>();
  const candidates = createSpawnCandidates(context);
  for (const candidate of candidates) {
    for (const segment of candidate.segments) {
      forbidden.add(pointKey(segment));
    }
  }
  return forbidden;
}

function buildReservedItemCells(): SnakePoint[] {
  return [];
}

function calculateFoodTarget(width: number, height: number, alivePlayers: number): number {
  if (width <= 0 || height <= 0 || alivePlayers <= 0) {
    return 0;
  }

  return alivePlayers + SNAKE_FOOD_BASE_TARGET;
}

function calculateCoinTarget(width: number, height: number, alivePlayers: number): number {
  const area = width * height;
  return Math.max(0, Math.round(SNAKE_COIN_AREA_FACTOR * area + SNAKE_COIN_ALIVE_FACTOR * alivePlayers));
}

function effectDurationTicks(type: SnakeItemType, tickHz: number): number {
  switch (type) {
    case "boost":
      return toTicks(SNAKE_BOOST_SECONDS, tickHz);
    case "magnet":
      return toTicks(SNAKE_MAGNET_SECONDS, tickHz);
    case "shield":
      return toTicks(SNAKE_SHIELD_SECONDS, tickHz);
    default:
      return toTicks(SNAKE_BOOST_SECONDS, tickHz);
  }
}

function activateEffect(snake: SnakePlayerState, type: SnakeItemType, ticksRemaining: number): SnakePlayerState {
  const nextEffects = snake.activeEffects.map((effect) =>
    effect.type === type
      ? {
          ...effect,
          charges: type === "shield" ? 1 : 0,
          ticksRemaining,
        }
      : effect,
  );
  const hasExisting = nextEffects.some((effect) => effect.type === type);
  if (!hasExisting) {
    nextEffects.push({
      charges: type === "shield" ? 1 : 0,
      ticksRemaining,
      type,
    });
  }

  return {
    ...snake,
    activeEffects: nextEffects,
  };
}

function consumeShieldCharge(snake: SnakePlayerState): SnakePlayerState {
  const nextEffects = snake.activeEffects.flatMap((effect) => {
    if (effect.type !== "shield") {
      return [effect];
    }
    const nextCharges = Math.max(0, effect.charges - 1);
    if (nextCharges <= 0) {
      return [];
    }
    return [
      {
        ...effect,
        charges: nextCharges,
      },
    ];
  });

  return {
    ...snake,
    activeEffects: nextEffects,
  };
}

function hasActiveEffect(snake: SnakePlayerState, effectType: SnakeItemType): boolean {
  return snake.activeEffects.some(
    (effect) =>
      effect.type === effectType &&
      effect.ticksRemaining > 0 &&
      (effectType !== "shield" || effect.charges > 0),
  );
}

function hasShieldCharge(snake: SnakePlayerState): boolean {
  return snake.activeEffects.some(
    (effect) => effect.type === "shield" && effect.ticksRemaining > 0 && effect.charges > 0,
  );
}

function isItemTypeEnabled(type: SnakeItemType, settings: SnakeItemSettings): boolean {
  switch (type) {
    case "boost":
      return settings.boost;
    case "magnet":
      return settings.magnet;
    case "shield":
      return settings.shield;
    default:
      return false;
  }
}

function effectActivationKey(playerId: string, type: SnakeItemType): string {
  return `${playerId}:${type}`;
}

function makeDeadSnake(snake: SnakePlayerState, respawnTicks: number): SnakePlayerState {
  return {
    ...snake,
    activeEffects: [],
    alive: false,
    head: null,
    length: SNAKE_INITIAL_LENGTH,
    respawnTicksRemaining: respawnTicks,
    segments: [],
    spawnProtectionTicksRemaining: 0,
    speedBank: 0,
  };
}

function resetSnakeForRound(snake: SnakePlayerState, initialLength: number): SnakePlayerState {
  return {
    ...snake,
    activeEffects: [],
    alive: false,
    head: null,
    length: initialLength,
    respawnTicksRemaining: null,
    segments: [],
    spawnProtectionTicksRemaining: 0,
    speedBank: 0,
  };
}

function growSegmentsByOne(segments: SnakePoint[]): SnakePoint[] {
  if (segments.length === 0) {
    return [];
  }
  const tail = segments[segments.length - 1];
  if (tail === undefined) {
    return cloneSegments(segments);
  }

  return [...cloneSegments(segments), clonePoint(tail)];
}

function buildCellOccupancy(snakes: SnakePlayerState[]): {
  heads: Map<string, string[]>;
  owners: Map<string, string[]>;
} {
  const owners = new Map<string, string[]>();
  const heads = new Map<string, string[]>();
  for (const snake of snakes) {
    if (!snake.alive) {
      continue;
    }
    for (let index = 0; index < snake.segments.length; index += 1) {
      const segment = snake.segments[index];
      if (segment === undefined) {
        continue;
      }
      const key = pointKey(segment);
      const currentOwners = owners.get(key) ?? [];
      currentOwners.push(snake.playerId);
      owners.set(key, currentOwners);
      if (index === 0) {
        const currentHeads = heads.get(key) ?? [];
        currentHeads.push(snake.playerId);
        heads.set(key, currentHeads);
      }
    }
  }
  return { heads, owners };
}

function createManhattanPoints(center: SnakePoint, radius: number, context: SnakeContext): SnakePoint[] {
  const result: SnakePoint[] = [];
  const seen = new Set<string>();
  for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
    for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
      if (Math.abs(xOffset) + Math.abs(yOffset) > radius) {
        continue;
      }
      const candidate = wrapPoint({ x: center.x + xOffset, y: center.y + yOffset }, context);
      const key = pointKey(candidate);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(candidate);
    }
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function toTicks(seconds: number, tickHz: number): number {
  return Math.max(0, Math.round(seconds * tickHz));
}

function countAlive(snakes: SnakePlayerState[]): number {
  return snakes.filter((snake) => snake.alive).length;
}

function cloneMagnetAdjacencyPrimed(
  primed: Record<string, { coin: boolean; food: boolean }>,
): Record<string, { coin: boolean; food: boolean }> {
  return Object.fromEntries(
    Object.entries(primed).map(([playerId, flags]) => [
      playerId,
      {
        coin: flags.coin,
        food: flags.food,
      },
    ]),
  );
}
function clonePoint(point: SnakePoint): SnakePoint {
  return { ...point };
}

function clonePoints(points: SnakePoint[]): SnakePoint[] {
  return points.map((point) => clonePoint(point));
}

function cloneSegments(segments: SnakePoint[]): SnakePoint[] {
  return segments.map((segment) => clonePoint(segment));
}

function cloneSnake(snake: SnakePlayerState): SnakePlayerState {
  return {
    ...snake,
    activeEffects: snake.activeEffects.map((effect) => ({ ...effect })),
    head: snake.head === null ? null : clonePoint(snake.head),
    segments: cloneSegments(snake.segments),
  };
}

function cloneFoods(foods: SnakeFood[]): SnakeFood[] {
  return foods.map((food) => ({
    ...food,
    point: clonePoint(food.point),
  }));
}

function cloneCoins(coins: SnakeCoin[]): SnakeCoin[] {
  return coins.map((coin) => ({
    ...coin,
    point: clonePoint(coin.point),
  }));
}

function cloneItems(items: SnakeItem[]): SnakeItem[] {
  return items.map((item) => ({
    ...item,
    point: clonePoint(item.point),
  }));
}

function cloneCoinrush(state: SnakeCoinrushState | null): SnakeCoinrushState | null {
  if (state === null) {
    return null;
  }
  return {
    activeHotspots: clonePoints(state.activeHotspots),
    announcedHotspots: clonePoints(state.announcedHotspots),
    phase: state.phase,
    phaseTicksRemaining: state.phaseTicksRemaining,
    wave: state.wave,
  };
}

function movePoint(point: SnakePoint, direction: SnakeDirection): SnakePoint {
  const vector = directionVector(direction);
  return {
    x: point.x + vector.x,
    y: point.y + vector.y,
  };
}

function movePointTowards(from: SnakePoint, to: SnakePoint, context: SnakeContext): SnakePoint {
  const deltaX = shortestWrappedDelta(from.x, to.x, context.gridWidth);
  const deltaY = shortestWrappedDelta(from.y, to.y, context.gridHeight);

  if (Math.abs(deltaX) >= Math.abs(deltaY) && deltaX !== 0) {
    return wrapPoint(
      {
        x: from.x + Math.sign(deltaX),
        y: from.y,
      },
      context,
    );
  }
  if (deltaY !== 0) {
    return wrapPoint(
      {
        x: from.x,
        y: from.y + Math.sign(deltaY),
      },
      context,
    );
  }
  return clonePoint(from);
}

function wrapPoint(point: SnakePoint, context: SnakeContext): SnakePoint {
  return {
    x: wrapCoordinate(point.x, context.gridWidth),
    y: wrapCoordinate(point.y, context.gridHeight),
  };
}

function wrapCoordinate(value: number, maxExclusive: number): number {
  if (maxExclusive <= 0) {
    return 0;
  }
  return ((value % maxExclusive) + maxExclusive) % maxExclusive;
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

function isOppositeDirection(current: SnakeDirection, next: SnakeDirection): boolean {
  return (
    (current === "up" && next === "down") ||
    (current === "down" && next === "up") ||
    (current === "left" && next === "right") ||
    (current === "right" && next === "left")
  );
}

function isInsideGrid(point: SnakePoint, context: SnakeContext): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < context.gridWidth && point.y < context.gridHeight;
}

function pointKey(point: SnakePoint): string {
  return `${point.x}:${point.y}`;
}

function samePoint(left: SnakePoint, right: SnakePoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function hashString(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function manhattanDistance(left: SnakePoint, right: SnakePoint): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function toroidalManhattanDistance(left: SnakePoint, right: SnakePoint, context: SnakeContext): number {
  return (
    toroidalAxisDistance(left.x, right.x, context.gridWidth) +
    toroidalAxisDistance(left.y, right.y, context.gridHeight)
  );
}

function toroidalAxisDistance(left: number, right: number, size: number): number {
  if (size <= 0) {
    return Math.abs(left - right);
  }
  const direct = Math.abs(left - right);
  return Math.min(direct, Math.max(0, size - direct));
}

function shortestWrappedDelta(from: number, to: number, size: number): number {
  if (size <= 0) {
    return to - from;
  }

  const direct = to - from;
  let best = direct;
  const alternatives = [direct + size, direct - size];
  for (const alternative of alternatives) {
    if (Math.abs(alternative) < Math.abs(best)) {
      best = alternative;
    }
  }

  return best;
}

function resolveCoprimeStride(totalTiles: number, seed: number, minStride: number): number {
  if (totalTiles <= 1) {
    return 1;
  }

  const clampedMin = clampNumber(minStride, 1, Math.max(1, totalTiles - 1));
  let stride = normalizeIndex(seed, totalTiles - 1) + 1;
  let attempts = 0;

  while (attempts < totalTiles) {
    if (stride >= clampedMin && greatestCommonDivisor(stride, totalTiles) === 1) {
      return stride;
    }
    stride = stride + 1;
    if (stride >= totalTiles) {
      stride = 1;
    }
    attempts += 1;
  }

  return 1;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const temp = a % b;
    a = b;
    b = temp;
  }

  return a;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeIndex(index: number, modulo: number): number {
  if (modulo <= 0) {
    return 0;
  }
  return ((index % modulo) + modulo) % modulo;
}

function pointFromIndex(index: number, context: SnakeContext): SnakePoint {
  const normalized = normalizeIndex(index, context.gridWidth * context.gridHeight);
  const x = normalized % context.gridWidth;
  const y = Math.floor(normalized / context.gridWidth);
  return { x, y };
}

