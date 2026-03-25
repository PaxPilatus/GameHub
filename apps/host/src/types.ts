import type {
  GameManifest,
  GameMatchStatus,
  GameUiBadge,
  GameUiOverlay,
  SessionLeaderboardEntry,
} from "@game-hub/sdk";

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
}

export interface HostSnapshot {
  gameState: Record<string, unknown> | null;
  joinUrl: string | null;
  lastRelayMessageAt: number | null;
  leaderboard: SessionLeaderboardEntry[];
  lifecycle: HostLifecycle;
  matchStatus: GameMatchStatus;
  moderatorId: string | null;
  overlay: GameUiOverlay | null;
  players: HostPlayerSnapshot[];
  relayStatus: RelayConnectionStatus;
  selectedGame: string | null;
  sessionId: string | null;
  statusBadges: GameUiBadge[];
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
