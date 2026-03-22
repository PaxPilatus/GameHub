import { type GameStateMessage, type HelloAckMessage, type HostPlayerState, type PluginLoadedMessage, type PlayerRole, type RelayConnectionStatus, type SessionPhase, type SessionTerminatedMessage } from "@game-hub/protocol";
export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error" | "terminated";
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
export type MobileClientAction = {
    type: "name_changed";
    name: string;
} | {
    type: "connection_requested";
    reconnecting: boolean;
} | {
    type: "reconnect_scheduled";
    attempt: number;
} | {
    type: "hello_ack_received";
    message: HelloAckMessage;
} | {
    type: "plugin_loaded_received";
    message: PluginLoadedMessage;
} | {
    type: "game_state_received";
    message: GameStateMessage;
} | {
    type: "socket_closed";
    willReconnect: boolean;
} | {
    type: "relay_error_received";
    fatal: boolean;
    message: string;
} | {
    type: "player_token_cleared";
} | {
    type: "session_terminated_received";
    message: SessionTerminatedMessage;
};
export declare function createInitialMobileClientState(params: {
    playerName?: string;
    playerToken?: string | null;
    sessionId: string;
}): MobileClientState;
export declare function mobileClientReducer(state: MobileClientState, action: MobileClientAction): MobileClientState;
//# sourceMappingURL=state.d.ts.map