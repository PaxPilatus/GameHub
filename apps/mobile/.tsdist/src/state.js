import { safeParseHostStatePayload, } from "@game-hub/protocol";
export function createInitialMobileClientState(params) {
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
export function mobileClientReducer(state, action) {
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
                    activeGameId: action.message.pluginId === "lobby"
                        ? state.activeGameId
                        : action.message.pluginId,
                    lastGameState: action.message,
                };
            }
            const currentPlayer = state.playerId === null
                ? undefined
                : parsedState.data.players.find((player) => player.playerId === state.playerId);
            const selectedGame = parsedState.data.selectedGame;
            return {
                ...state,
                activeGameId: selectedGame ??
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
            if (!action.willReconnect &&
                (state.connectionState === "terminated" || state.connectionState === "error")) {
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
//# sourceMappingURL=state.js.map