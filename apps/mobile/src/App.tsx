import {
  PROTOCOL_VERSION,
  safeParseGameStateEnvelope,
  safeParseHostStatePayload,
  safeParseHubMessage,
  type HostPlayerState,
  type InputValue,
  type MobileHelloMessage,
} from "@game-hub/protocol";
import type {
  GameControlNode,
  GameControlSchema,
  GameMobileProps,
  GamePlayerSnapshot,
  GamePluginDefinition,
} from "@game-hub/sdk";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";

import {
  buildJoinSearch,
  extractSessionIdFromJoinTarget,
  resolveSessionIdFromSearch,
} from "./join-session.js";
import { loadMobilePluginDefinition } from "./plugin-loader.js";
import {
  clearPlayerToken,
  loadPlayerToken,
  savePlayerToken,
} from "./storage.js";
import {
  createInitialMobileClientState,
  mobileClientReducer,
} from "./state.js";

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
  const [state, dispatch] = useReducer(
    mobileClientReducer,
    createInitialMobileClientState({
      playerToken: loadPlayerToken(window.localStorage, sessionId),
      sessionId,
    }),
  );
  const [joinTarget, setJoinTarget] = useState<string>("");
  const [joinTargetError, setJoinTargetError] = useState<string | null>(null);
  const [loadedGameId, setLoadedGameId] = useState<string | null>(null);
  const [loadedPlugin, setLoadedPlugin] = useState<
    GamePluginDefinition<Record<string, unknown>> | null
  >(null);
  const [pluginLoadError, setPluginLoadError] = useState<string | null>(null);
  const [MobileComponent, setMobileComponent] = useState<ComponentType<
    GameMobileProps<Record<string, unknown>>
  > | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
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
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setLoadedPlugin(null);
        setMobileComponent(null);
        setLoadedGameId(null);
        setPluginLoadError(
          error instanceof Error ? error.message : "Failed to load plugin UI.",
        );
      });

    return () => {
      active = false;
    };
  }, [state.activeGameId, state.selectedGame]);

  function connect(reconnecting: boolean): void {
    if (sessionId === "") {
      return;
    }

    const currentSocket = socketRef.current;
    if (
      currentSocket !== null &&
      (currentSocket.readyState === WebSocket.CONNECTING ||
        currentSocket.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    clearReconnectTimer();
    dispatch({ type: "connection_requested", reconnecting });

    const socket = new WebSocket(buildMobileWebSocketUrl());
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      const currentState = stateRef.current;
      const helloMessage: MobileHelloMessage = {
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

      const willReconnect =
        shouldStayConnectedRef.current &&
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

  function handleSocketMessage(payload: string, socket: WebSocket): void {
    let decoded: unknown;

    try {
      decoded = JSON.parse(payload) as unknown;
    } catch {
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

  function scheduleReconnect(): void {
    if (reconnectTimerRef.current !== null) {
      return;
    }

    reconnectAttemptRef.current += 1;
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** (reconnectAttemptRef.current - 1),
      MAX_RECONNECT_DELAY_MS,
    );

    dispatch({
      type: "reconnect_scheduled",
      attempt: reconnectAttemptRef.current,
    });

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      connect(true);
    }, delay);
  }

  function startHeartbeat(intervalMs: number): void {
    clearHeartbeat();
    heartbeatTimerRef.current = window.setInterval(() => {
      const socket = socketRef.current;

      if (socket === null || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      socket.send(
        JSON.stringify({
          id: window.crypto.randomUUID(),
          sentAt: Date.now(),
          type: "heartbeat",
        }),
      );
    }, intervalMs);
  }

  function clearHeartbeat(): void {
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function sendInput(action: string, payload?: InputValue): void {
    const socket = socketRef.current;
    const playerId = stateRef.current.playerId;

    if (
      socket === null ||
      socket.readyState !== WebSocket.OPEN ||
      playerId === null
    ) {
      return;
    }

    inputSequenceRef.current += 1;
    socket.send(
      JSON.stringify({
        action,
        id: window.crypto.randomUUID(),
        playerId,
        sequence: inputSequenceRef.current,
        sentAt: Date.now(),
        type: "input",
        ...(payload === undefined ? {} : { value: payload }),
      }),
    );
  }

  function handleJoinSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    shouldStayConnectedRef.current = true;
    reconnectAttemptRef.current = 0;
    connect(state.playerToken !== null);
  }

  function handleSessionLinkSubmit(event: FormEvent<HTMLFormElement>): void {
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
  const parsedEnvelope =
    state.lastGameState === null
      ? null
      : safeParseGameStateEnvelope(state.lastGameState.state);
  const parsedHostState =
    state.lastGameState === null
      ? null
      : safeParseHostStatePayload(state.lastGameState.state);
  const hubSession =
    parsedEnvelope?.success === true
      ? parsedEnvelope.data.hubState
      : parsedHostState?.success === true
        ? parsedHostState.data
        : null;
  const gameState = parsedEnvelope?.success === true ? parsedEnvelope.data.gameState : null;
  const joinPageError = joinTargetError ?? searchResolution.error;
  const gamePlayers = state.players.map((player) => toGamePlayer(player));
  const controlsSchema =
    loadedPlugin?.controls?.({
      gameState,
      hubSession,
      phase: state.phase,
      playerId: state.playerId,
      players: gamePlayers,
      role: state.role,
    }) ?? null;
  const matchStatus = hubSession?.matchStatus ?? null;
  const overlay = hubSession?.overlay ?? null;

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Game Hub Mobile</p>
        <h1>
          {sessionId === ""
            ? "Join a session from your phone."
            : "Join a local session from your phone."}
        </h1>
        <p className="hero-copy">
          {sessionId === ""
            ? "Paste the host link or type the session ID to open the lobby on this phone."
            : <>Relay session <strong>{sessionId}</strong></>}
        </p>
        <div className="status-row">
          <StatusPill label="Connection" value={state.connectionState} />
          <StatusPill label="Reconnect" value={state.reconnectState} />
          <StatusPill label="Phase" value={state.phase} />
        </div>
      </section>

      {sessionId === "" ? (
        <section className="panel">
          <h2>Join Session</h2>
          <form className="join-form" onSubmit={handleSessionLinkSubmit}>
            <label className="field-label" htmlFor="join-target">Session ID or join URL</label>
            <input
              id="join-target"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="35fb14f7e386 or https://relay.example/?sessionId=35fb14f7e386"
              spellCheck={false}
              value={joinTarget}
              onChange={(event) => {
                setJoinTarget(event.target.value);
                if (joinTargetError !== null) {
                  setJoinTargetError(null);
                }
              }}
            />
            <button type="submit">Open Session</button>
          </form>
          <p className="hint-copy">
            The relay root page works as a lightweight join screen. Once the session ID is resolved, the existing lobby and reconnect flow continue unchanged.
          </p>
        </section>
      ) : null}

      {showLanding && sessionId !== "" ? (
        <section className="panel">
          <h2>Landing</h2>
          <form className="join-form" onSubmit={handleJoinSubmit}>
            <label className="field-label" htmlFor="player-name">Display name</label>
            <input
              id="player-name"
              autoComplete="nickname"
              placeholder="Player name"
              value={state.playerName}
              onChange={(event) => {
                dispatch({ type: "name_changed", name: event.target.value });
              }}
            />
            <button type="submit" disabled={state.connectionState === "connecting"}>
              {state.playerToken === null ? "Join Session" : "Reconnect"}
            </button>
          </form>
          <p className="hint-copy">
            {state.playerToken === null
              ? "A new playerToken is issued after hello_ack and stored locally for reconnects."
              : "Stored reconnect token found. The client can reclaim the same player slot after reload."}
          </p>
        </section>
      ) : null}

      {state.playerId !== null ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Lobby</h2>
                <p className="meta-copy">
                  You are <strong>{state.role ?? "player"}</strong> Ã¯Â¿Â½ Relay <strong>{state.relayStatus ?? "pending"}</strong>
                </p>
              </div>
              <div className="identity-block">
                <span>Player</span>
                <strong>{state.playerId}</strong>
              </div>
            </div>
            {state.role === "moderator" ? (
              <div className="moderator-callout">
                <strong>Moderator view</strong>
                <p>
                  The host still owns game selection and start/stop. This client only exposes the mobile input surface.
                </p>
              </div>
            ) : null}
            <div className="player-list">
              {state.players.length === 0 ? (
                <p className="empty-copy">Waiting for the latest host snapshot.</p>
              ) : (
                state.players.map((player) => (
                  <article key={player.playerId} className="player-card">
                    <div>
                      <h3>{player.name}</h3>
                      <p>{player.playerId}</p>
                    </div>
                    <div className="player-meta">
                      <span>{player.role}</span>
                      <span>Team {player.team}</span>
                      <span>{player.connected ? "online" : "offline"}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          {gameId !== null ? (
            <section className="panel plugin-panel">
              {overlay === null ? null : (
                <section className="moderator-callout">
                  <strong>{overlay.title}</strong>
                  {overlay.message === null ? null : <p>{overlay.message}</p>}
                </section>
              )}

              {matchStatus !== null &&
              (matchStatus.title !== null || matchStatus.message !== null) ? (
                <section className="panel">
                  <h2>{matchStatus.title ?? "Match status"}</h2>
                  {matchStatus.message === null ? null : <p>{matchStatus.message}</p>}
                </section>
              ) : null}

              {controlsSchema === null ? null : (
                <HubControlsPanel schema={controlsSchema} sendInput={sendInput} />
              )}

              {pluginLoadError !== null ? (
                <p className="error-copy">{pluginLoadError}</p>
              ) : MobileComponent === null || loadedGameId !== gameId ? (
                loadedPlugin !== null && loadedPlugin.ui.mobile === undefined ? null : (
                  <p className="hint-copy">Loading plugin UI...</p>
                )
              ) : (
                <MobileComponent
                  gameState={gameState}
                  hubSession={hubSession}
                  phase={state.phase}
                  playerId={state.playerId}
                  players={gamePlayers}
                  role={state.role}
                  sendInput={sendInput}
                />
              )}

              {controlsSchema === null &&
              MobileComponent === null &&
              loadedGameId === gameId &&
              pluginLoadError === null ? (
                <p className="hint-copy">This game does not expose a mobile scene yet.</p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {joinPageError !== null ? (
        <section className="panel error-panel">
          <h2>Join Error</h2>
          <p>{joinPageError}</p>
        </section>
      ) : null}

      {state.lastError !== null ? (
        <section className="panel error-panel">
          <h2>Relay Error</h2>
          <p>{state.lastError}</p>
        </section>
      ) : null}

      {state.sessionTerminatedReason !== null ? (
        <section className="panel error-panel">
          <h2>Session Terminated</h2>
          <p>{state.sessionTerminatedReason}</p>
        </section>
      ) : null}
    </main>
  );

  function buildMobileWebSocketUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/mobile`;
  }
}

interface HubControlsPanelProps {
  schema: GameControlSchema;
  sendInput(action: string, payload?: InputValue): void;
}

function HubControlsPanel(props: HubControlsPanelProps) {
  return (
    <section className="panel">
      <h2>Controls</h2>
      <div className="plugin-stack">
        {props.schema.controls.map((control, index) => (
          <ControlNodeView
            key={control.kind + '-' + String(index)}
            control={control}
            sendInput={props.sendInput}
          />
        ))}
      </div>
    </section>
  );
}

interface ControlNodeViewProps {
  control: GameControlNode;
  sendInput(action: string, payload?: InputValue): void;
}

function ControlNodeView(props: ControlNodeViewProps) {
  const { control, sendInput } = props;

  switch (control.kind) {
    case "button": {
      return (
        <button
          type="button"
          disabled={control.disabled === true}
          onClick={() => sendInput(control.action, control.payload)}
        >
          {control.label}
        </button>
      );
    }
    case "dpad": {
      const labels = {
        down: control.labels?.down ?? "Down",
        left: control.labels?.left ?? "Left",
        right: control.labels?.right ?? "Right",
        up: control.labels?.up ?? "Up",
      };

      return (
        <div className="plugin-stack">
          <div className="actions-grid">
            <button
              type="button"
              disabled={control.disabled === true}
              onClick={() => sendInput(control.action, { dir: "up" })}
            >
              {labels.up}
            </button>
          </div>
          <div className="actions-grid">
            <button
              type="button"
              disabled={control.disabled === true}
              onClick={() => sendInput(control.action, { dir: "left" })}
            >
              {labels.left}
            </button>
            <button
              type="button"
              disabled={control.disabled === true}
              onClick={() => sendInput(control.action, { dir: "down" })}
            >
              {labels.down}
            </button>
            <button
              type="button"
              disabled={control.disabled === true}
              onClick={() => sendInput(control.action, { dir: "right" })}
            >
              {labels.right}
            </button>
          </div>
        </div>
      );
    }
    case "group": {
      return (
        <section className="plugin-stack">
          {control.title === undefined ? null : <h3>{control.title}</h3>}
          {control.controls.map((child, index) => (
            <ControlNodeView
              key={child.kind + '-' + String(index)}
              control={child}
              sendInput={sendInput}
            />
          ))}
        </section>
      );
    }
    case "notice": {
      return <p className="plugin-copy">{control.text}</p>;
    }
    case "options": {
      return (
        <section className="plugin-stack">
          {control.label === undefined ? null : <h3>{control.label}</h3>}
          <div className={control.layout === "list" ? "plugin-stack" : "actions-grid"}>
            {control.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={control.disabled === true || option.disabled === true}
                onClick={() => sendInput(control.action, option.payload ?? option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      );
    }
    default: {
      return null;
    }
  }
}

interface StatusPillProps {
  label: string;
  value: string;
}

function StatusPill(props: StatusPillProps) {
  return (
    <div className="status-pill">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function toGamePlayer(player: HostPlayerState): GamePlayerSnapshot {
  return {
    connected: player.connected,
    lastSeen: player.lastSeen,
    name: player.name,
    playerId: player.playerId,
    role: player.role,
    team: player.team,
  };
}

