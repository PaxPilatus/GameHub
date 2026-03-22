import type { GameManifest } from "@game-hub/sdk";

export type HostLifecycle =
  | "idle"
  | "lobby"
  | "game_running"
  | "game_finished"
  | "closing"
  | "terminated";

export type RelayConnectionStatus =
  | "disconnected"
  | "creating_session"
  | "connecting"
  | "connected"
  | "error";

export type PlayerRole = "player" | "moderator";
export type PlayerTeam = "A" | "B";
export type DiagnosticLevel = "info" | "warn" | "error";

export interface HostPlayerSnapshot {
  connected: boolean;
  lastSeen: number;
  latencyEstimateMs: number | null;
  name: string;
  playerId: string;
  role: PlayerRole;
  team: PlayerTeam;
  token: string | null;
}

export interface HostSnapshot {
  joinUrl: string | null;
  lastRelayMessageAt: number | null;
  lifecycle: HostLifecycle;
  moderatorId: string | null;
  players: HostPlayerSnapshot[];
  pluginState: Record<string, unknown> | null;
  relayStatus: RelayConnectionStatus;
  selectedGame: string | null;
  sessionId: string | null;
  updatedAt: number;
}

export interface HostDiagnosticEvent {
  data: Record<string, unknown>;
  id: string;
  level: DiagnosticLevel;
  message: string;
  timestamp: number;
  type: string;
}

export interface RendererInitialState {
  availableGames: GameManifest[];
  diagnostics: HostDiagnosticEvent[];
  snapshot: HostSnapshot;
}