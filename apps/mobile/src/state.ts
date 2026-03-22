import {
  safeParseHostStatePayload,
  type GameStateMessage,
  type HelloAckMessage,
  type HostPlayerState,
  type PluginLoadedMessage,
  type PlayerRole,
  type RelayConnectionStatus,
  type SessionPhase,
  type SessionTerminatedMessage,
} from "@game-hub/protocol";

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error"
  | "terminated";

export type ReconnectState = "idle" | "attempting" | "restored" | "blocked";

export interface MobileClientState {
  activeGameId: string | null;
  connectionState: ConnectionState;
  lastError: string | null;
  lastGameState: GameStateMessage | null;
  phase: SessionPhase;
  playerId: string | null;
  playerName: string;
  playerToken: string | null;
  players: HostPlayerState[];
  reconnectAttempt: number;
  reconnectState: ReconnectState;
  relayStatus: RelayConnectionStatus | null;
  role: PlayerRole | null;
  selectedGame: string | null;
  sessionId: string;
  sessionTerminatedReason: string | null;
}

export type MobileClientAction =
  | { type: "name_changed"; name: string }
  | { type: "connection_requested"; reconnecting: boolean }
  | { type: "reconnect_scheduled"; attempt: number }
  | { type: "hello_ack_received"; message: HelloAckMessage }
  | { type: "plugin_loaded_received"; message: PluginLoadedMessage }
  | { type: "game_state_received"; message: GameStateMessage }
  | { type: "socket_closed"; willReconnect: boolean }
  | { type: "relay_error_received"; fatal: boolean; message: string }
  | { type: "player_token_cleared" }
  | { type: "session_terminated_received"; message: SessionTerminatedMessage };

export function createInitialMobileClientState(params: {
  playerName?: string;
  playerToken?: string | null;
  sessionId: string;
}): MobileClientState {
  return {
    activeGameId: null,
    connectionState: "idle",
    lastError: null,
    lastGameState: null,
    phase: "idle",
    playerId: null,
    playerName: params.playerName ?? "",
    playerToken: params.playerToken ?? null,
    players: [],
    reconnectAttempt: 0,
    reconnectState: "idle",
    relayStatus: null,
    role: null,
    selectedGame: null,
    sessionId: params.sessionId,
    sessionTerminatedReason: null,
  };
}

export function mobileClientReducer(
  state: MobileClientState,
  action: MobileClientAction,
): MobileClientState {
  switch (action.type) {
    case "name_changed": {
      return {
        ...state,
        playerName: action.name,
      };
    }
    case "connection_requested": {
      return {
        ...state,
        connectionState: action.reconnecting ? "reconnecting" : "connecting",
        lastError: null,
        reconnectState: action.reconnecting ? "attempting" : state.reconnectState,
        sessionTerminatedReason: null,
      };
    }
    case "reconnect_scheduled": {
      return {
        ...state,
        connectionState: "reconnecting",
        reconnectAttempt: action.attempt,
        reconnectState: "attempting",
      };
    }
    case "hello_ack_received": {
      return {
        ...state,
        connectionState: "connected",
        lastError: null,
        phase: action.message.phase ?? state.phase,
        playerId: action.message.playerId ?? state.playerId,
        playerToken: action.message.playerToken ?? state.playerToken,
        reconnectAttempt: 0,
        reconnectState: action.message.reconnect ? "restored" : "idle",
        role: action.message.role ?? state.role,
      };
    }
    case "plugin_loaded_received": {
      return {
        ...state,
        activeGameId: action.message.pluginId,
        selectedGame: action.message.pluginId,
      };
    }
    case "game_state_received": {
      const parsedState = safeParseHostStatePayload(action.message.state);

      if (!parsedState.success) {
        return {
          ...state,
          activeGameId:
            action.message.pluginId === "lobby"
              ? state.activeGameId
              : action.message.pluginId,
          lastGameState: action.message,
        };
      }

      const currentPlayer =
        state.playerId === null
          ? undefined
          : parsedState.data.players.find(
              (player) => player.playerId === state.playerId,
            );
      const selectedGame = parsedState.data.selectedGame;

      return {
        ...state,
        activeGameId:
          selectedGame ??
          (action.message.pluginId === "lobby" ? null : action.message.pluginId),
        lastGameState: action.message,
        phase: parsedState.data.lifecycle,
        players: parsedState.data.players,
        relayStatus: parsedState.data.relayStatus,
        role: currentPlayer?.role ?? state.role,
        selectedGame,
        sessionId: parsedState.data.sessionId,
      };
    }
    case "socket_closed": {
      if (
        !action.willReconnect &&
        (state.connectionState === "terminated" || state.connectionState === "error")
      ) {
        return state;
      }

      return {
        ...state,
        connectionState: action.willReconnect ? "reconnecting" : "disconnected",
        reconnectState: action.willReconnect ? "attempting" : state.reconnectState,
      };
    }
    case "relay_error_received": {
      return {
        ...state,
        connectionState: action.fatal ? "error" : state.connectionState,
        lastError: action.message,
        reconnectState: action.fatal ? "blocked" : state.reconnectState,
      };
    }
    case "player_token_cleared": {
      return {
        ...state,
        activeGameId: null,
        lastGameState: null,
        phase: "idle",
        playerId: null,
        playerToken: null,
        players: [],
        reconnectAttempt: 0,
        reconnectState: "idle",
        role: null,
        selectedGame: null,
      };
    }
    case "session_terminated_received": {
      return {
        ...state,
        connectionState: "terminated",
        phase: "terminated",
        reconnectState: "blocked",
        sessionTerminatedReason: action.message.reason,
      };
    }
  }
}
