import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { PROTOCOL_VERSION, safeParseGameStateEnvelope, safeParseHostStatePayload, safeParseHubMessage, } from "@game-hub/protocol";
import { useEffect, useReducer, useRef, useState, } from "react";
import { buildJoinSearch, extractSessionIdFromJoinTarget, resolveSessionIdFromSearch, } from "./join-session.js";
import { loadMobilePluginDefinition } from "./plugin-loader.js";
import { clearPlayerToken, loadPlayerToken, savePlayerToken, } from "./storage.js";
import { createInitialMobileClientState, mobileClientReducer, } from "./state.js";
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 15_000;
const FATAL_RELAY_ERRORS = new Set([
    "invalid_player_token",
    "session_expired",
    "session_not_found",
]);
export function App() {
    const searchResolution = resolveSessionIdFromSearch(window.location.search);
    const sessionId = searchResolution.sessionId;
    const [state, dispatch] = useReducer(mobileClientReducer, createInitialMobileClientState({
        playerToken: loadPlayerToken(window.localStorage, sessionId),
        sessionId,
    }));
    const [joinTarget, setJoinTarget] = useState("");
    const [joinTargetError, setJoinTargetError] = useState(null);
    const [loadedGameId, setLoadedGameId] = useState(null);
    const [loadedPlugin, setLoadedPlugin] = useState(null);
    const [pluginLoadError, setPluginLoadError] = useState(null);
    const [MobileComponent, setMobileComponent] = useState(null);
    const socketRef = useRef(null);
    const heartbeatTimerRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const reconnectAttemptRef = useRef(0);
    const shouldStayConnectedRef = useRef(false);
    const stateRef = useRef(state);
    const inputSequenceRef = useRef(0);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);
    useEffect(() => {
        if (sessionId !== "" && state.playerToken !== null) {
            shouldStayConnectedRef.current = true;
            connect(true);
        }
        return () => {
            shouldStayConnectedRef.current = false;
            clearReconnectTimer();
            clearHeartbeat();
            const socket = socketRef.current;
            socketRef.current = null;
            socket?.close();
        };
    }, [sessionId]);
    useEffect(() => {
        const gameId = state.activeGameId ?? state.selectedGame;
        if (gameId === null) {
            setLoadedPlugin(null);
            setMobileComponent(null);
            setLoadedGameId(null);
            setPluginLoadError(null);
            return;
        }
        let active = true;
        setLoadedPlugin(null);
        setMobileComponent(null);
        setLoadedGameId(null);
        setPluginLoadError(null);
        void loadMobilePluginDefinition(gameId)
            .then((plugin) => {
            if (!active) {
                return;
            }
            setLoadedPlugin(plugin);
            setLoadedGameId(gameId);
            setMobileComponent(() => plugin?.ui.mobile ?? null);
            setPluginLoadError(plugin === null ? `No plugin registered for ${gameId}.` : null);
        })
            .catch((error) => {
            if (!active) {
                return;
            }
            setLoadedPlugin(null);
            setMobileComponent(null);
            setLoadedGameId(null);
            setPluginLoadError(error instanceof Error ? error.message : "Failed to load plugin UI.");
        });
        return () => {
            active = false;
        };
    }, [state.activeGameId, state.selectedGame]);
    function connect(reconnecting) {
        if (sessionId === "") {
            return;
        }
        const currentSocket = socketRef.current;
        if (currentSocket !== null &&
            (currentSocket.readyState === WebSocket.CONNECTING ||
                currentSocket.readyState === WebSocket.OPEN)) {
            return;
        }
        clearReconnectTimer();
        dispatch({ type: "connection_requested", reconnecting });
        const socket = new WebSocket(buildMobileWebSocketUrl());
        socketRef.current = socket;
        socket.addEventListener("open", () => {
            const currentState = stateRef.current;
            const helloMessage = {
                clientKind: "mobile",
                id: window.crypto.randomUUID(),
                protocolVersion: PROTOCOL_VERSION,
                sentAt: Date.now(),
                sessionId,
                type: "hello",
                ...(currentState.playerName.trim() === ""
                    ? {}
                    : { name: currentState.playerName.trim() }),
                ...(currentState.playerToken === null
                    ? {}
                    : { token: currentState.playerToken }),
            };
            socket.send(JSON.stringify(helloMessage));
        });
        socket.addEventListener("message", (event) => {
            handleSocketMessage(String(event.data), socket);
        });
        socket.addEventListener("close", () => {
            if (socketRef.current === socket) {
                socketRef.current = null;
            }
            clearHeartbeat();
            const willReconnect = shouldStayConnectedRef.current &&
                stateRef.current.connectionState !== "terminated" &&
                sessionId !== "";
            dispatch({ type: "socket_closed", willReconnect });
            if (willReconnect) {
                scheduleReconnect();
            }
        });
        socket.addEventListener("error", () => {
            dispatch({
                type: "relay_error_received",
                fatal: false,
                message: "WebSocket error while talking to the relay.",
            });
        });
    }
    function handleSocketMessage(payload, socket) {
        let decoded;
        try {
            decoded = JSON.parse(payload);
        }
        catch {
            dispatch({
                type: "relay_error_received",
                fatal: false,
                message: "Relay sent malformed JSON.",
            });
            return;
        }
        const parsed = safeParseHubMessage(decoded);
        if (!parsed.success) {
            dispatch({
                type: "relay_error_received",
                fatal: false,
                message: "Relay sent an unsupported message shape.",
            });
            return;
        }
        switch (parsed.data.type) {
            case "hello_ack": {
                reconnectAttemptRef.current = 0;
                if (parsed.data.playerToken !== undefined) {
                    savePlayerToken(window.localStorage, sessionId, parsed.data.playerToken);
                }
                dispatch({ type: "hello_ack_received", message: parsed.data });
                startHeartbeat(parsed.data.heartbeatIntervalMs);
                return;
            }
            case "plugin_loaded": {
                dispatch({ type: "plugin_loaded_received", message: parsed.data });
                return;
            }
            case "game_state": {
                dispatch({ type: "game_state_received", message: parsed.data });
                return;
            }
            case "session_terminated": {
                shouldStayConnectedRef.current = false;
                clearReconnectTimer();
                clearHeartbeat();
                clearPlayerToken(window.localStorage, sessionId);
                dispatch({ type: "session_terminated_received", message: parsed.data });
                socket.close();
                return;
            }
            case "error": {
                const isFatal = FATAL_RELAY_ERRORS.has(parsed.data.code);
                if (isFatal) {
                    clearPlayerToken(window.localStorage, sessionId);
                    dispatch({ type: "player_token_cleared" });
                }
                dispatch({
                    type: "relay_error_received",
                    fatal: isFatal,
                    message: parsed.data.message,
                });
                if (isFatal) {
                    shouldStayConnectedRef.current = false;
                    clearReconnectTimer();
                    clearHeartbeat();
                    socket.close();
                }
                return;
            }
            default: {
                return;
            }
        }
    }
    function scheduleReconnect() {
        if (reconnectTimerRef.current !== null) {
            return;
        }
        reconnectAttemptRef.current += 1;
        const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * 2 ** (reconnectAttemptRef.current - 1), MAX_RECONNECT_DELAY_MS);
        dispatch({
            type: "reconnect_scheduled",
            attempt: reconnectAttemptRef.current,
        });
        reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            connect(true);
        }, delay);
    }
    function startHeartbeat(intervalMs) {
        clearHeartbeat();
        heartbeatTimerRef.current = window.setInterval(() => {
            const socket = socketRef.current;
            if (socket === null || socket.readyState !== WebSocket.OPEN) {
                return;
            }
            socket.send(JSON.stringify({
                id: window.crypto.randomUUID(),
                sentAt: Date.now(),
                type: "heartbeat",
            }));
        }, intervalMs);
    }
    function clearHeartbeat() {
        if (heartbeatTimerRef.current !== null) {
            window.clearInterval(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
        }
    }
    function clearReconnectTimer() {
        if (reconnectTimerRef.current !== null) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    }
    function sendInput(action, payload) {
        const socket = socketRef.current;
        const playerId = stateRef.current.playerId;
        if (socket === null ||
            socket.readyState !== WebSocket.OPEN ||
            playerId === null) {
            return;
        }
        inputSequenceRef.current += 1;
        socket.send(JSON.stringify({
            action,
            id: window.crypto.randomUUID(),
            playerId,
            sequence: inputSequenceRef.current,
            sentAt: Date.now(),
            type: "input",
            ...(payload === undefined ? {} : { value: payload }),
        }));
    }
    function handleJoinSubmit(event) {
        event.preventDefault();
        shouldStayConnectedRef.current = true;
        reconnectAttemptRef.current = 0;
        connect(state.playerToken !== null);
    }
    function handleSessionLinkSubmit(event) {
        event.preventDefault();
        const nextSessionId = extractSessionIdFromJoinTarget(joinTarget);
        if (nextSessionId === null) {
            setJoinTargetError("Enter a session ID or paste the full join URL from the host.");
            return;
        }
        setJoinTargetError(null);
        const nextUrl = new URL(window.location.href);
        nextUrl.search = buildJoinSearch(nextSessionId);
        nextUrl.hash = "";
        window.location.assign(nextUrl.toString());
    }
    const gameId = state.activeGameId ?? state.selectedGame;
    const showLanding = state.playerId === null && state.connectionState !== "reconnecting";
    const parsedEnvelope = state.lastGameState === null
        ? null
        : safeParseGameStateEnvelope(state.lastGameState.state);
    const parsedHostState = state.lastGameState === null
        ? null
        : safeParseHostStatePayload(state.lastGameState.state);
    const hubSession = parsedEnvelope?.success === true
        ? parsedEnvelope.data.hubState
        : parsedHostState?.success === true
            ? parsedHostState.data
            : null;
    const gameState = parsedEnvelope?.success === true ? parsedEnvelope.data.gameState : null;
    const joinPageError = joinTargetError ?? searchResolution.error;
    const gamePlayers = state.players.map((player) => toGamePlayer(player));
    const controlsSchema = loadedPlugin?.controls?.({
        gameState,
        hubSession,
        phase: state.phase,
        playerId: state.playerId,
        players: gamePlayers,
        role: state.role,
    }) ?? null;
    const matchStatus = hubSession?.matchStatus ?? null;
    const overlay = hubSession?.overlay ?? null;
    return (_jsxs("main", { className: "app-shell", children: [_jsxs("section", { className: "hero-card", children: [_jsx("p", { className: "eyebrow", children: "Game Hub Mobile" }), _jsx("h1", { children: sessionId === ""
                            ? "Join a session from your phone."
                            : "Join a local session from your phone." }), _jsx("p", { className: "hero-copy", children: sessionId === ""
                            ? "Paste the host link or type the session ID to open the lobby on this phone."
                            : _jsxs(_Fragment, { children: ["Relay session ", _jsx("strong", { children: sessionId })] }) }), _jsxs("div", { className: "status-row", children: [_jsx(StatusPill, { label: "Connection", value: state.connectionState }), _jsx(StatusPill, { label: "Reconnect", value: state.reconnectState }), _jsx(StatusPill, { label: "Phase", value: state.phase })] })] }), sessionId === "" ? (_jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Join Session" }), _jsxs("form", { className: "join-form", onSubmit: handleSessionLinkSubmit, children: [_jsx("label", { className: "field-label", htmlFor: "join-target", children: "Session ID or join URL" }), _jsx("input", { id: "join-target", autoCapitalize: "off", autoCorrect: "off", placeholder: "35fb14f7e386 or https://relay.example/?sessionId=35fb14f7e386", spellCheck: false, value: joinTarget, onChange: (event) => {
                                    setJoinTarget(event.target.value);
                                    if (joinTargetError !== null) {
                                        setJoinTargetError(null);
                                    }
                                } }), _jsx("button", { type: "submit", children: "Open Session" })] }), _jsx("p", { className: "hint-copy", children: "The relay root page works as a lightweight join screen. Once the session ID is resolved, the existing lobby and reconnect flow continue unchanged." })] })) : null, showLanding && sessionId !== "" ? (_jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Landing" }), _jsxs("form", { className: "join-form", onSubmit: handleJoinSubmit, children: [_jsx("label", { className: "field-label", htmlFor: "player-name", children: "Display name" }), _jsx("input", { id: "player-name", autoComplete: "nickname", placeholder: "Player name", value: state.playerName, onChange: (event) => {
                                    dispatch({ type: "name_changed", name: event.target.value });
                                } }), _jsx("button", { type: "submit", disabled: state.connectionState === "connecting", children: state.playerToken === null ? "Join Session" : "Reconnect" })] }), _jsx("p", { className: "hint-copy", children: state.playerToken === null
                            ? "A new playerToken is issued after hello_ack and stored locally for reconnects."
                            : "Stored reconnect token found. The client can reclaim the same player slot after reload." })] })) : null, state.playerId !== null ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Lobby" }), _jsxs("p", { className: "meta-copy", children: ["You are ", _jsx("strong", { children: state.role ?? "player" }), " \u00C3\u00AF\u00C2\u00BF\u00C2\u00BD Relay ", _jsx("strong", { children: state.relayStatus ?? "pending" })] })] }), _jsxs("div", { className: "identity-block", children: [_jsx("span", { children: "Player" }), _jsx("strong", { children: state.playerId })] })] }), state.role === "moderator" ? (_jsxs("div", { className: "moderator-callout", children: [_jsx("strong", { children: "Moderator view" }), _jsx("p", { children: "The host still owns game selection and start/stop. This client only exposes the mobile input surface." })] })) : null, _jsx("div", { className: "player-list", children: state.players.length === 0 ? (_jsx("p", { className: "empty-copy", children: "Waiting for the latest host snapshot." })) : (state.players.map((player) => (_jsxs("article", { className: "player-card", children: [_jsxs("div", { children: [_jsx("h3", { children: player.name }), _jsx("p", { children: player.playerId })] }), _jsxs("div", { className: "player-meta", children: [_jsx("span", { children: player.role }), _jsxs("span", { children: ["Team ", player.team] }), _jsx("span", { children: player.connected ? "online" : "offline" })] })] }, player.playerId)))) })] }), gameId !== null ? (_jsxs("section", { className: "panel plugin-panel", children: [overlay === null ? null : (_jsxs("section", { className: "moderator-callout", children: [_jsx("strong", { children: overlay.title }), overlay.message === null ? null : _jsx("p", { children: overlay.message })] })), matchStatus !== null &&
                                (matchStatus.title !== null || matchStatus.message !== null) ? (_jsxs("section", { className: "panel", children: [_jsx("h2", { children: matchStatus.title ?? "Match status" }), matchStatus.message === null ? null : _jsx("p", { children: matchStatus.message })] })) : null, controlsSchema === null ? null : (_jsx(HubControlsPanel, { schema: controlsSchema, sendInput: sendInput })), pluginLoadError !== null ? (_jsx("p", { className: "error-copy", children: pluginLoadError })) : MobileComponent === null || loadedGameId !== gameId ? (loadedPlugin !== null && loadedPlugin.ui.mobile === undefined ? null : (_jsx("p", { className: "hint-copy", children: "Loading plugin UI..." }))) : (_jsx(MobileComponent, { gameState: gameState, hubSession: hubSession, phase: state.phase, playerId: state.playerId, players: gamePlayers, role: state.role, sendInput: sendInput })), controlsSchema === null &&
                                MobileComponent === null &&
                                loadedGameId === gameId &&
                                pluginLoadError === null ? (_jsx("p", { className: "hint-copy", children: "This game does not expose a mobile scene yet." })) : null] })) : null] })) : null, joinPageError !== null ? (_jsxs("section", { className: "panel error-panel", children: [_jsx("h2", { children: "Join Error" }), _jsx("p", { children: joinPageError })] })) : null, state.lastError !== null ? (_jsxs("section", { className: "panel error-panel", children: [_jsx("h2", { children: "Relay Error" }), _jsx("p", { children: state.lastError })] })) : null, state.sessionTerminatedReason !== null ? (_jsxs("section", { className: "panel error-panel", children: [_jsx("h2", { children: "Session Terminated" }), _jsx("p", { children: state.sessionTerminatedReason })] })) : null] }));
    function buildMobileWebSocketUrl() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.host}/ws/mobile`;
    }
}
function HubControlsPanel(props) {
    return (_jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Controls" }), _jsx("div", { className: "plugin-stack", children: props.schema.controls.map((control, index) => (_jsx(ControlNodeView, { control: control, sendInput: props.sendInput }, control.kind + '-' + String(index)))) })] }));
}
function ControlNodeView(props) {
    const { control, sendInput } = props;
    switch (control.kind) {
        case "button": {
            return (_jsx("button", { type: "button", disabled: control.disabled === true, onClick: () => sendInput(control.action, control.payload), children: control.label }));
        }
        case "dpad": {
            const labels = {
                down: control.labels?.down ?? "Down",
                left: control.labels?.left ?? "Left",
                right: control.labels?.right ?? "Right",
                up: control.labels?.up ?? "Up",
            };
            return (_jsxs("div", { className: "plugin-stack", children: [_jsx("div", { className: "actions-grid", children: _jsx("button", { type: "button", disabled: control.disabled === true, onClick: () => sendInput(control.action, { dir: "up" }), children: labels.up }) }), _jsxs("div", { className: "actions-grid", children: [_jsx("button", { type: "button", disabled: control.disabled === true, onClick: () => sendInput(control.action, { dir: "left" }), children: labels.left }), _jsx("button", { type: "button", disabled: control.disabled === true, onClick: () => sendInput(control.action, { dir: "down" }), children: labels.down }), _jsx("button", { type: "button", disabled: control.disabled === true, onClick: () => sendInput(control.action, { dir: "right" }), children: labels.right })] })] }));
        }
        case "group": {
            return (_jsxs("section", { className: "plugin-stack", children: [control.title === undefined ? null : _jsx("h3", { children: control.title }), control.controls.map((child, index) => (_jsx(ControlNodeView, { control: child, sendInput: sendInput }, child.kind + '-' + String(index))))] }));
        }
        case "notice": {
            return _jsx("p", { className: "plugin-copy", children: control.text });
        }
        case "options": {
            return (_jsxs("section", { className: "plugin-stack", children: [control.label === undefined ? null : _jsx("h3", { children: control.label }), _jsx("div", { className: control.layout === "list" ? "plugin-stack" : "actions-grid", children: control.options.map((option) => (_jsx("button", { type: "button", disabled: control.disabled === true || option.disabled === true, onClick: () => sendInput(control.action, option.payload ?? option.id), children: option.label }, option.id))) })] }));
        }
        default: {
            return null;
        }
    }
}
function StatusPill(props) {
    return (_jsxs("div", { className: "status-pill", children: [_jsx("span", { children: props.label }), _jsx("strong", { children: props.value })] }));
}
function toGamePlayer(player) {
    return {
        connected: player.connected,
        lastSeen: player.lastSeen,
        name: player.name,
        playerId: player.playerId,
        role: player.role,
        team: player.team,
    };
}
//# sourceMappingURL=App.js.map