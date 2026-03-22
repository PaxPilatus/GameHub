import type {
  HostStatePayload,
  InputMessage,
  InputValue,
  PlayerRole,
  RelayConnectionStatus,
  SessionPhase,
} from "@game-hub/protocol";
import type { ComponentType } from "react";

export type GameStateRecord = Record<string, unknown>;

export interface GameManifest {
  description?: string;
  displayName: string;
  id: string;
  supportsTeams?: boolean;
  tickHz?: number;
  version: string;
}

export interface GamePlayerSnapshot {
  connected: boolean;
  lastSeen: number;
  name: string;
  playerId: string;
  role: PlayerRole;
  team: "A" | "B";
}

export interface GameSessionSnapshot {
  joinUrl: string | null;
  lastRelayMessageAt: number | null;
  lifecycle: SessionPhase;
  moderatorId: string | null;
  players: GamePlayerSnapshot[];
  pluginState: GameStateRecord | null;
  relayStatus: RelayConnectionStatus;
  selectedGame: string | null;
  sessionId: string | null;
  updatedAt: number;
}

export interface GameInputEnvelope<
  TInput = InputValue | undefined,
> {
  action: string;
  payload: TInput | undefined;
  playerId: string;
  raw: InputMessage;
}

export interface GameHostApi<
  TState extends GameStateRecord = GameStateRecord,
> {
  getPlayers(): GamePlayerSnapshot[];
  getSnapshot(): GameSessionSnapshot;
  getState(): TState;
  log(
    level: "info" | "warn" | "error",
    type: string,
    message: string,
    data?: Record<string, unknown>,
  ): void;
  setState(nextState: TState): void;
  updateState(updater: (state: TState) => TState): void;
}

export interface GameUiBaseProps<
  TState extends GameStateRecord = GameStateRecord,
> {
  hostState: HostStatePayload | null;
  phase: SessionPhase;
  players: GamePlayerSnapshot[];
  pluginState: TState | null;
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
  relayStatus: RelayConnectionStatus | null;
  sessionId: string | null;
}

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
  central: ComponentType<GameCentralProps<TState>>;
  createInitialState(): TState;
  manifest: GameManifest;
  mobile: ComponentType<GameMobileProps<TState>>;
  parseInput?(message: InputMessage): TInput | undefined;
  server: GameServer<TState, TInput>;
}

export interface GamePluginModuleLike {
  default?: GamePluginDefinition;
  gamePlugin?: GamePluginDefinition;
  manifest?: GameManifest;
}

export function createGamePlugin<
  TState extends GameStateRecord,
  TInput = InputValue | undefined,
>(
  plugin: GamePluginDefinition<TState, TInput>,
): GamePluginDefinition<TState, TInput> {
  return plugin;
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

  return plugin;
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
    "mobile" in value &&
    typeof value.mobile === "function" &&
    "central" in value &&
    typeof value.central === "function"
  );
}
