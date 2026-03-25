import type {
  HubStatePayload,
  InputMessage,
  InputValue,
  PlayerRole,
  PlayerTeam,
  SessionPhase,
} from "@game-hub/protocol";
import type { ComponentType } from "react";

export type GameStateRecord = Record<string, unknown>;
export type GameMatchStatusState =
  | "idle"
  | "countdown"
  | "running"
  | "paused"
  | "round_finished"
  | "match_finished";
export type GameRankingMode = "wins" | "score" | "placement" | "custom";
export type GameInputMode = "declarative" | "hybrid" | "custom";

export interface GameUiSlots {
  central: boolean;
  mobile: boolean;
  results: boolean;
}

export interface GameManifest {
  description?: string;
  displayName: string;
  id: string;
  inputMode?: GameInputMode;
  maxPlayers?: number;
  minPlayers?: number;
  rankingMode?: GameRankingMode;
  roundsMode?: "single_match" | "rounds";
  supportsTeams?: boolean;
  tickHz?: number;
  uiSlots?: Partial<GameUiSlots>;
  version: string;
}

export interface GamePlayerSnapshot {
  connected: boolean;
  lastSeen: number;
  name: string;
  playerId: string;
  role: PlayerRole;
  team: PlayerTeam;
}

export interface SessionLeaderboardEntry {
  connected: boolean;
  name: string;
  placement: number | null;
  playerId: string;
  role: PlayerRole;
  score: number;
  status: string | null;
  team: PlayerTeam;
  teamScore: number;
  wins: number;
}

export interface GameMatchStatus {
  message: string | null;
  state: GameMatchStatusState;
  title: string | null;
}

export interface GameUiBadge {
  id: string;
  label: string;
  tone?: "info" | "neutral" | "success" | "warn";
  value: string;
}

export interface GameUiOverlay {
  message: string | null;
  title: string;
  tone?: "error" | "info" | "success" | "warn";
}

export interface HubSessionState {
  joinUrl: string | null;
  lastRelayMessageAt: number | null;
  leaderboard: SessionLeaderboardEntry[];
  lifecycle: SessionPhase;
  matchStatus: GameMatchStatus;
  moderatorId: string | null;
  overlay: GameUiOverlay | null;
  players: GamePlayerSnapshot[];
  relayStatus: HubStatePayload["relayStatus"];
  selectedGame: string | null;
  sessionId: string | null;
  statusBadges: GameUiBadge[];
  updatedAt: number;
}

export type GameSessionSnapshot = HubSessionState;

export type GameControlNode =
  | GameControlButton
  | GameControlDpad
  | GameControlGroup
  | GameControlNotice
  | GameControlOptions;

export interface GameControlSchema {
  controls: GameControlNode[];
}

export interface GameControlButton {
  action: string;
  disabled?: boolean;
  kind: "button";
  label: string;
  payload?: InputValue;
  tone?: "primary" | "secondary";
}

export interface GameControlDpad {
  action: string;
  disabled?: boolean;
  kind: "dpad";
  labels?: Partial<Record<"down" | "left" | "right" | "up", string>>;
}

export interface GameControlGroup {
  controls: GameControlNode[];
  kind: "group";
  title?: string;
}

export interface GameControlNotice {
  kind: "notice";
  text: string;
  tone?: "info" | "success" | "warn";
}

export interface GameControlOption {
  disabled?: boolean;
  id: string;
  label: string;
  payload?: InputValue;
}

export interface GameControlOptions {
  action: string;
  disabled?: boolean;
  kind: "options";
  layout?: "grid" | "list";
  label?: string;
  options: GameControlOption[];
}

export interface GameResultEvent {
  message?: string;
  playerId?: string;
  placement?: number;
  points?: number;
  status?: string | null;
  team?: PlayerTeam;
  title?: string;
  type:
    | "award_player_points"
    | "award_team_points"
    | "clear_leaderboard"
    | "end_match"
    | "end_round"
    | "record_player_win"
    | "record_placement"
    | "set_player_score"
    | "set_player_status"
    | "set_team_score";
}

export interface GameInputEnvelope<TInput = InputValue | undefined> {
  action: string;
  payload: TInput | undefined;
  playerId: string;
  raw: InputMessage;
}

export interface GameStateCapability<
  TState extends GameStateRecord = GameStateRecord,
> {
  get(): TState;
  set(nextState: TState): void;
  update(updater: (state: TState) => TState): void;
}

export interface GameSessionCapability {
  getLeaderboard(): SessionLeaderboardEntry[];
  getModeratorId(): string | null;
  getPlayers(): GamePlayerSnapshot[];
  getSnapshot(): HubSessionState;
  setPlayerStatus(playerId: string, status: string | null): void;
}

export interface GameResultsCapability {
  awardPlayerPoints(playerId: string, points: number): void;
  awardTeamPoints(team: PlayerTeam, points: number): void;
  clearLeaderboard(): void;
  endMatch(summary?: {
    message?: string;
    title?: string;
  }): void;
  endRound(summary?: {
    message?: string;
    title?: string;
  }): void;
  recordPlayerWin(playerId: string): void;
  recordPlacement(playerId: string, placement: number): void;
  setPlayerScore(playerId: string, score: number): void;
  setPlayerStatus(playerId: string, status: string | null): void;
  setTeamScore(team: PlayerTeam, score: number): void;
}

export interface GameUiCapability {
  clearOverlay(): void;
  publishStatusBadges(badges: GameUiBadge[]): void;
  setOverlay(overlay: GameUiOverlay | null): void;
}

export interface GameLogCapability {
  event(
    level: "error" | "info" | "warn",
    type: string,
    message: string,
    data?: Record<string, unknown>,
  ): void;
}

export interface GameHostApi<
  TState extends GameStateRecord = GameStateRecord,
> {
  getPlayers(): GamePlayerSnapshot[];
  getSnapshot(): HubSessionState;
  getState(): TState;
  log(
    level: "error" | "info" | "warn",
    type: string,
    message: string,
    data?: Record<string, unknown>,
  ): void;
  results: GameResultsCapability;
  session: GameSessionCapability;
  setState(nextState: TState): void;
  state: GameStateCapability<TState>;
  ui: GameUiCapability;
  updateState(updater: (state: TState) => TState): void;
}

export interface GameUiBaseProps<
  TState extends GameStateRecord = GameStateRecord,
> {
  gameState: TState | null;
  hubSession: HubSessionState | null;
  phase: SessionPhase;
  players: GamePlayerSnapshot[];
}

export interface GameControlsResolverContext<
  TState extends GameStateRecord = GameStateRecord,
> extends GameUiBaseProps<TState> {
  playerId: string | null;
  role: PlayerRole | null;
}

export interface GameMobileProps<
  TState extends GameStateRecord = GameStateRecord,
> extends GameUiBaseProps<TState> {
  playerId: string | null;
  role: PlayerRole | null;
  sendInput(action: string, payload?: InputValue): void;
}

export interface GameCentralProps<
  TState extends GameStateRecord = GameStateRecord,
> extends GameUiBaseProps<TState> {
  invokeHostAction(action: string, payload?: InputValue): Promise<void>;
}

export type GameResultsProps<
  TState extends GameStateRecord = GameStateRecord,
> = GameUiBaseProps<TState>;

export interface GameUiDefinition<
  TState extends GameStateRecord = GameStateRecord,
> {
  central?: ComponentType<GameCentralProps<TState>>;
  mobile?: ComponentType<GameMobileProps<TState>>;
  results?: ComponentType<GameResultsProps<TState>>;
}

export type GameControlsResolver<
  TState extends GameStateRecord = GameStateRecord,
> = (
  context: GameControlsResolverContext<TState>,
) => GameControlSchema | null;

export interface GameServer<
  TState extends GameStateRecord = GameStateRecord,
  TInput = InputValue | undefined,
> {
  onGameStart?(api: GameHostApi<TState>): void;
  onGameStop?(api: GameHostApi<TState>): void;
  onInput?(api: GameHostApi<TState>, input: GameInputEnvelope<TInput>): void;
  onPlayerJoin?(api: GameHostApi<TState>, player: GamePlayerSnapshot): void;
  onPlayerLeave?(api: GameHostApi<TState>, player: GamePlayerSnapshot): void;
  onPlayerReconnect?(api: GameHostApi<TState>, player: GamePlayerSnapshot): void;
  onSessionCreated?(api: GameHostApi<TState>): void;
  onTick?(api: GameHostApi<TState>): void;
}

export interface GamePluginDefinition<
  TState extends GameStateRecord = GameStateRecord,
  TInput = InputValue | undefined,
> {
  controls?: GameControlsResolver<TState>;
  createInitialState(): TState;
  manifest: GameManifest;
  parseInput?(message: InputMessage): TInput | undefined;
  server: GameServer<TState, TInput>;
  ui: GameUiDefinition<TState>;
}

export interface LegacyGamePluginDefinition<
  TState extends GameStateRecord = GameStateRecord,
  TInput = InputValue | undefined,
> extends Omit<GamePluginDefinition<TState, TInput>, "ui"> {
  central?: ComponentType<GameCentralProps<TState>>;
  mobile?: ComponentType<GameMobileProps<TState>>;
  results?: ComponentType<GameResultsProps<TState>>;
  ui?: GameUiDefinition<TState>;
}

export interface GamePluginModuleLike {
  default?: LegacyGamePluginDefinition;
  gamePlugin?: LegacyGamePluginDefinition;
  manifest?: GameManifest;
}

export function createGamePlugin<
  TState extends GameStateRecord,
  TInput = InputValue | undefined,
>(
  plugin: LegacyGamePluginDefinition<TState, TInput>,
): GamePluginDefinition<TState, TInput> {
  return normalizeGamePlugin(plugin);
}

export function resolveGamePlugin(
  value: GamePluginDefinition | GamePluginModuleLike,
): GamePluginDefinition {
  if (isGamePluginDefinition(value)) {
    return value;
  }

  const plugin = value.gamePlugin ?? value.default;

  if (plugin === undefined) {
    throw new Error("Plugin module is missing a game plugin export.");
  }

  return normalizeGamePlugin(plugin);
}

function isGamePluginDefinition(
  value: GamePluginDefinition | GamePluginModuleLike,
): value is GamePluginDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "manifest" in value &&
    typeof value.manifest === "object" &&
    value.manifest !== null &&
    "createInitialState" in value &&
    typeof value.createInitialState === "function" &&
    "server" in value &&
    typeof value.server === "object" &&
    value.server !== null &&
    "ui" in value &&
    typeof value.ui === "object" &&
    value.ui !== null
  );
}

function normalizeGamePlugin<
  TState extends GameStateRecord,
  TInput = InputValue | undefined,
>(
  plugin: LegacyGamePluginDefinition<TState, TInput>,
): GamePluginDefinition<TState, TInput> {
  const ui = plugin.ui ?? {
    ...(plugin.central === undefined ? {} : { central: plugin.central }),
    ...(plugin.mobile === undefined ? {} : { mobile: plugin.mobile }),
    ...(plugin.results === undefined ? {} : { results: plugin.results }),
  };

  return {
    ...(plugin.controls === undefined ? {} : { controls: plugin.controls }),
    createInitialState: plugin.createInitialState,
    manifest: {
      inputMode: plugin.controls === undefined ? "custom" : "hybrid",
      minPlayers: 1,
      rankingMode: "custom",
      uiSlots: {
        central: ui.central !== undefined,
        mobile: ui.mobile !== undefined,
        results: ui.results !== undefined,
      },
      ...plugin.manifest,
    },
    ...(plugin.parseInput === undefined ? {} : { parseInput: plugin.parseInput }),
    server: plugin.server,
    ui,
  };
}
