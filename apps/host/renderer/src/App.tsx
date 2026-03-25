import React, { useEffect, useMemo, useState, type ComponentType } from "react";

import type { InputValue } from "@game-hub/protocol";
import type {
  HostDiagnosticEvent,
  HostPlayerSnapshot,
  HostSnapshot,
  RendererInitialState,
} from "../../src/types.js";
import type {
  GameCentralProps,
  GameManifest,
  GamePlayerSnapshot,
} from "@game-hub/sdk";
import QRCode from "qrcode";

import {
  buildCentralLeaderboard,
  type CentralLeaderboardEntry,
} from "./central-leaderboard.js";
import { loadCentralPluginComponent } from "./plugin-loader.js";

const DIAGNOSTICS_LIMIT = 200;

type HostApi = Window["hostApi"];
type HostWindowKind = "admin" | "central";
type CopyStatus = "copied" | "failed" | "idle";

export function App() {
  const windowKind = useMemo(() => resolveWindowKind(), []);
  const [availableGames, setAvailableGames] = useState<GameManifest[]>([]);
  const [diagnostics, setDiagnostics] = useState<HostDiagnosticEvent[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [loadedGameId, setLoadedGameId] = useState<string | null>(null);
  const [pluginLoadError, setPluginLoadError] = useState<string | null>(null);
  const [pluginQrCode, setPluginQrCode] = useState<string>("");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [snapshot, setSnapshot] = useState<HostSnapshot | null>(null);
  const [CentralComponent, setCentralComponent] = useState<ComponentType<
    GameCentralProps<Record<string, unknown>>
  > | null>(null);

  useEffect(() => {
    const hostApi = getHostApi();

    if (hostApi === null) {
      setFatalError(
        "The Electron preload bridge is unavailable. Verify that apps/host/preload.cjs exists and restart the host.",
      );
      return;
    }

    let disposed = false;
    let detachSnapshot = () => {};
    let detachDiagnostic = () => {};

    void hostApi
      .getInitialState()
      .then((initialState) => {
        if (disposed) {
          return;
        }

        applyInitialState(initialState);
        setFatalError(null);
        detachSnapshot = hostApi.onSnapshot((nextSnapshot) => {
          setSnapshot(nextSnapshot);
        });
        detachDiagnostic = hostApi.onDiagnostic((event) => {
          setDiagnostics((current) => [event, ...current].slice(0, DIAGNOSTICS_LIMIT));
        });
      })
      .catch((error: unknown) => {
        if (disposed) {
          return;
        }

        setFatalError(
          formatFatalError(
            error,
            "Failed to load the initial host state from the Electron main process. Restart the host and inspect the diagnostics output.",
          ),
        );
      });

    return () => {
      disposed = true;
      detachSnapshot();
      detachDiagnostic();
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("central-window-body", windowKind === "central");
    return () => {
      document.body.classList.remove("central-window-body");
    };
  }, [windowKind]);

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopyStatus("idle");
    }, 1_600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyStatus]);

  useEffect(() => {
    if (
      windowKind !== "admin" ||
      snapshot?.joinUrl === null ||
      snapshot?.joinUrl === undefined
    ) {
      setPluginQrCode("");
      return;
    }

    let active = true;
    void QRCode.toDataURL(snapshot.joinUrl, {
      margin: 1,
      width: 196,
    })
      .then((dataUrl) => {
        if (active) {
          setPluginQrCode(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setPluginQrCode("");
        }
      });

    return () => {
      active = false;
    };
  }, [snapshot?.joinUrl, windowKind]);

  useEffect(() => {
    setCopyStatus("idle");
  }, [snapshot?.joinUrl]);

  useEffect(() => {
    const nextGameId = snapshot?.selectedGame ?? null;

    if (nextGameId === null) {
      setCentralComponent(null);
      setLoadedGameId(null);
      setPluginLoadError(null);
      return;
    }

    let active = true;
    setCentralComponent(null);
    setLoadedGameId(null);
    setPluginLoadError(null);

    void loadCentralPluginComponent(nextGameId)
      .then((component) => {
        if (!active) {
          return;
        }

        setLoadedGameId(nextGameId);
        setCentralComponent(() => component);
        setPluginLoadError(
          component === null ? `No central UI registered for ${nextGameId}.` : null,
        );
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setCentralComponent(null);
        setLoadedGameId(null);
        setPluginLoadError(
          error instanceof Error ? error.message : "Failed to load plugin UI.",
        );
      });

    return () => {
      active = false;
    };
  }, [snapshot?.selectedGame]);

  if (fatalError !== null) {
    return (
      <main className="host-shell host-shell-single">
        <section className="panel fatal-panel">
          <p className="eyebrow">Host Renderer Error</p>
          <h1>Host UI could not start.</h1>
          <p className="fatal-copy">{fatalError}</p>
          <p className="hint-copy">
            The Electron main process continues to log diagnostics in the terminal. After fixing the cause, restart the host window.
          </p>
        </section>
      </main>
    );
  }

  if (snapshot === null) {
    return (
      <main className="host-shell host-shell-single">
        <section className="panel loading-panel">
          <p className="eyebrow">Game Hub Host</p>
          <h1>Loading host...</h1>
          <p className="hint-copy">
            Waiting for the Electron preload bridge and the initial relay snapshot.
          </p>
        </section>
      </main>
    );
  }

  const players = snapshot.players.map((player) => toGamePlayer(player));
  const averageLatencyMs = calculateAverageLatency(snapshot.players);
  const centralLeaderboard = buildCentralLeaderboard(snapshot);
  const joinUrlWarning =
    snapshot.joinUrl === null ? null : getJoinUrlWarning(snapshot.joinUrl);
  const hubSession =
    snapshot.sessionId === null ? null : toHubSession(snapshot, players);
  const canSelectGame = snapshot.lifecycle !== "game_running";
  const canStartSelectedGame =
    snapshot.selectedGame !== null &&
    (snapshot.lifecycle === "lobby" || snapshot.lifecycle === "game_finished");
  const canRestartSelectedGame =
    snapshot.selectedGame !== null &&
    (snapshot.lifecycle === "lobby" ||
      snapshot.lifecycle === "game_running" ||
      snapshot.lifecycle === "game_finished");
  const canRestartSession =
    snapshot.lifecycle !== "closing" &&
    snapshot.relayStatus !== "creating_session" &&
    snapshot.relayStatus !== "connecting";
  const selectedGameLabel = resolveGameLabel(availableGames, snapshot.selectedGame);
  const handleCopyJoinUrl = () => {
    if (snapshot.joinUrl === null) {
      return;
    }

    void copyTextToClipboard(snapshot.joinUrl)
      .then(() => {
        setCopyStatus("copied");
      })
      .catch(() => {
        setCopyStatus("failed");
      });
  };

  const centralView = renderCentralView({
    CentralComponent,
    hubSession,
    loadedGameId,
    players,
    pluginLoadError,
    setFatalError,
    snapshot,
    windowKind,
  });

  if (windowKind === "central") {
    return (
      <main className="central-shell">
        <header className="central-toolbar">
          <div className="central-toolbar-meta">
            <p className="eyebrow">Game Hub Central</p>
            <div className="central-toolbar-title-row">
              <h1>{selectedGameLabel}</h1>
              <span className="central-phase-pill">
                {formatLifecycleLabel(snapshot.lifecycle)}
              </span>
            </div>
            <p className="central-toolbar-subtitle">
              Session {snapshot.sessionId ?? "pending"} / Relay {snapshot.relayStatus}
            </p>
          </div>
          <CentralPlayerStrip entries={centralLeaderboard} />
          <div className="toolbar-actions central-toolbar-actions">
            <button
              type="button"
              disabled={!canRestartSelectedGame}
              onClick={() => invokeHostAction(setFatalError, (hostApi) => hostApi.restartGame())}
            >
              Restart Game
            </button>
            <button
              type="button"
              onClick={() =>
                invokeHostAction(setFatalError, (hostApi) =>
                  hostApi.toggleCurrentWindowFullscreen(),
                )
              }
            >
              Toggle Fullscreen
            </button>
            <button
              type="button"
              onClick={() =>
                invokeHostAction(setFatalError, (hostApi) => hostApi.closeCentralWindow())
              }
            >
              Close Central Screen
            </button>
          </div>
        </header>
        <section className="central-stage-panel">{centralView}</section>
      </main>
    );
  }

  return (
    <main className="host-shell">
      <div className="left-column">
        <section className="panel hero-panel">
          <div className="hero-grid">
            <div className="qr-shell">
              {pluginQrCode === "" ? (
                <div className="qr-placeholder">QR pending</div>
              ) : (
                <img alt="Join QR code" src={pluginQrCode} />
              )}
            </div>
            <div className="hero-copy-block">
              <div className="hero-heading">
                <p className="eyebrow">Game Hub Host</p>
                <h1>Central Screen + Admin</h1>
              </div>
              <JoinUrlBlock
                copyStatus={copyStatus}
                joinUrl={snapshot.joinUrl}
                onCopy={handleCopyJoinUrl}
              />
              {joinUrlWarning === null ? null : (
                <div className="warning-callout">
                  <strong>Public reachability warning</strong>
                  <p>{joinUrlWarning}</p>
                </div>
              )}
              <div className="hero-actions">
                <button
                  type="button"
                  onClick={() =>
                    invokeHostAction(setFatalError, (hostApi) => hostApi.openCentralWindow())
                  }
                >
                  Open Central Screen
                </button>
                <button
                  type="button"
                  onClick={() =>
                    invokeHostAction(setFatalError, (hostApi) =>
                      hostApi.toggleCurrentWindowFullscreen(),
                    )
                  }
                >
                  Fullscreen Host
                </button>
              </div>
              <div className="status-grid">
                <StatusCard label="Session" value={snapshot.sessionId ?? "pending"} />
                <StatusCard label="Connection" value={snapshot.relayStatus} />
                <StatusCard label="Lifecycle" value={snapshot.lifecycle} />
                <StatusCard label="Selected Game" value={selectedGameLabel} />
                <StatusCard label="Moderator" value={resolveModeratorName(snapshot)} />
                <StatusCard label="Avg Latency" value={formatLatency(averageLatencyMs)} />
              </div>
            </div>
          </div>
        </section>

        <section className="panel admin-panel">
          <div className="panel-header">
            <div>
              <h2>Admin</h2>
              <p className="hint-copy">
                Host-owned controls for selection, lifecycle and resets.
              </p>
            </div>
          </div>
          <div className="admin-toolbar">
            <select
              disabled={!canSelectGame}
              value={snapshot.selectedGame ?? ""}
              onChange={(event) => {
                if (event.target.value !== "") {
                  invokeHostAction(setFatalError, (hostApi) =>
                    hostApi.selectGame(event.target.value),
                  );
                }
              }}
            >
              <option value="">Select game</option>
              {availableGames.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!canStartSelectedGame}
              onClick={() => invokeHostAction(setFatalError, (hostApi) => hostApi.startGame())}
            >
              Start
            </button>
            <button
              type="button"
              disabled={snapshot.lifecycle !== "game_running"}
              onClick={() => invokeHostAction(setFatalError, (hostApi) => hostApi.stopGame())}
            >
              Stop
            </button>
            <button
              type="button"
              disabled={!canRestartSelectedGame}
              onClick={() =>
                invokeHostAction(setFatalError, (hostApi) => hostApi.restartGame())
              }
            >
              Restart Game
            </button>
            <button
              type="button"
              disabled={!canRestartSession}
              onClick={() =>
                invokeHostAction(setFatalError, (hostApi) => hostApi.restartSession())
              }
            >
              Restart Session
            </button>
          </div>
        </section>

        <section className="panel lobby-panel">
          <div className="panel-header">
            <div>
              <h2>Lobby</h2>
              <p className="hint-copy">
                Players, teams and roles come from the authoritative host session.
              </p>
            </div>
            <span className="badge">{snapshot.players.length} players</span>
          </div>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th>Latency</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.players.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No players connected yet.</td>
                  </tr>
                ) : (
                  snapshot.players.map((player) => (
                    <tr key={player.playerId}>
                      <td>{player.name}</td>
                      <td>{player.team}</td>
                      <td>{player.role}</td>
                      <td>{player.connected ? "connected" : "disconnected"}</td>
                      <td>{formatTime(player.lastSeen)}</td>
                      <td>{formatLatency(player.latencyEstimateMs)}</td>
                      <td>
                        <button
                          type="button"
                          disabled={player.role === "moderator"}
                          onClick={() =>
                            invokeHostAction(setFatalError, (hostApi) =>
                              hostApi.setModerator(player.playerId),
                            )
                          }
                        >
                          Set Moderator
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="right-column">
        <section className="panel central-panel">
          <div className="panel-header">
            <div>
              <h2>Central Preview</h2>
              <p className="hint-copy">
                Small live preview of the selected central scene.
              </p>
            </div>
            <span className="badge">{snapshot.selectedGame ?? "none"}</span>
          </div>
          <div className="central-preview-frame">{centralView}</div>
        </section>

        <section className="panel diagnostics-panel">
          <div className="panel-header">
            <div>
              <h2>Diagnostics</h2>
              <p className="hint-copy">
                Last {DIAGNOSTICS_LIMIT} host events. Latest entries stay visible; structured payloads open on demand.
              </p>
            </div>
            <span className="badge">{`${diagnostics.length} events / ${formatLatency(averageLatencyMs)}`}</span>
          </div>
          <div className="diagnostics-list">
            {diagnostics.map((event) => (
              <DiagnosticEventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );

  function applyInitialState(initialState: RendererInitialState): void {
    setAvailableGames(initialState.availableGames);
    setDiagnostics(initialState.diagnostics);
    setSnapshot(initialState.snapshot);
  }
}

interface RenderCentralViewParams {
  CentralComponent: ComponentType<GameCentralProps<Record<string, unknown>>> | null;
  hubSession: GameCentralProps<Record<string, unknown>>["hubSession"];
  loadedGameId: string | null;
  players: GamePlayerSnapshot[];
  pluginLoadError: string | null;
  setFatalError: (value: string | null) => void;
  snapshot: HostSnapshot;
  windowKind: HostWindowKind;
}

function renderCentralView(params: RenderCentralViewParams) {
  const {
    CentralComponent,
    hubSession,
    loadedGameId,
    players,
    pluginLoadError,
    setFatalError,
    snapshot,
    windowKind,
  } = params;

  if (snapshot.selectedGame === null) {
    return renderCentralPlaceholder(
      windowKind,
      windowKind === "central"
        ? "Select and start a game from the host admin window to populate the central screen."
        : "Select a game to mount its central UI.",
    );
  }

  if (pluginLoadError !== null) {
    return renderCentralPlaceholder(windowKind, pluginLoadError, "error");
  }

  if (CentralComponent === null || loadedGameId !== snapshot.selectedGame) {
    return renderCentralPlaceholder(windowKind, "Loading plugin UI...");
  }

  return (
    <CentralComponent
      gameState={snapshot.gameState}
      hubSession={hubSession}
      invokeHostAction={(action: string, payload?: InputValue) => {
        invokeHostAction(setFatalError, (hostApi) =>
          hostApi.sendPluginAction(action, payload),
        );
      }}
      phase={snapshot.lifecycle}
      players={players}
    />
  );
}

export interface JoinUrlBlockProps {
  copyStatus: CopyStatus;
  joinUrl: string | null;
  onCopy(): void;
}

export function JoinUrlBlock(props: JoinUrlBlockProps) {
  return (
    <div className="join-block">
      <span className="join-block-label">Players join via</span>
      <div className="join-block-row">
        <div className="join-url-field" title={props.joinUrl ?? "Join URL pending"}>
          <span>{props.joinUrl ?? "Creating join URL..."}</span>
        </div>
        <button
          type="button"
          className="join-copy-button"
          disabled={props.joinUrl === null}
          onClick={props.onCopy}
        >
          {formatCopyLabel(props.copyStatus)}
        </button>
      </div>
    </div>
  );
}

interface DiagnosticEventCardProps {
  event: HostDiagnosticEvent;
}

export function DiagnosticEventCard(props: DiagnosticEventCardProps) {
  const { event } = props;
  const hasPayload = Object.keys(event.data).length > 0;

  return (
    <details className={`diag diag-${event.level}`}>
      <summary className="diag-summary">
        <div className="diag-main">
          <span className={`diag-accent diag-accent-${event.level}`} aria-hidden="true" />
          <div className="diag-copy-stack">
            <strong>{event.type}</strong>
            <p>{event.message}</p>
          </div>
        </div>
        <div className="diag-meta">
          <span className={`diag-tone diag-tone-${event.level}`}>{event.level}</span>
          <time dateTime={new Date(event.timestamp).toISOString()}>
            {formatTime(event.timestamp)}
          </time>
        </div>
      </summary>
      <div className="diag-details">
        <div className="diag-detail-scroll">
          <div className="diag-detail-block">
            <span className="diag-detail-label">Message</span>
            <p className="diag-detail-message">{event.message}</p>
          </div>
          {hasPayload ? (
            <div className="diag-detail-block">
              <span className="diag-detail-label">Payload</span>
              <pre>{JSON.stringify(event.data, null, 2)}</pre>
            </div>
          ) : (
            <p className="hint-copy">No structured payload for this event.</p>
          )}
        </div>
      </div>
    </details>
  );
}

interface CentralPlayerStripProps {
  entries: CentralLeaderboardEntry[];
}

function CentralPlayerStrip(props: CentralPlayerStripProps) {
  if (props.entries.length === 0) {
    return (
      <div className="central-toplist">
        <p className="central-toplist-empty">Waiting for players to join the session.</p>
      </div>
    );
  }

  return (
    <div className="central-toplist" aria-label="Player toplist">
      {props.entries.map((entry, index) => (
        <article
          key={entry.playerId}
          className={`central-player-chip central-player-${entry.status}`}
        >
          <span className="central-player-rank">{index + 1}</span>
          <div className="central-player-copy">
            <strong title={entry.name}>{entry.name}</strong>
            <span>{entry.status}</span>
          </div>
          <div className="central-player-metric">
            <span>{entry.metricLabel}</span>
            <strong>{entry.metricValue}</strong>
          </div>
        </article>
      ))}
    </div>
  );
}

interface StatusCardProps {
  label: string;
  value: string;
}

function StatusCard(props: StatusCardProps) {
  return (
    <div className="status-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function calculateAverageLatency(players: HostPlayerSnapshot[]): number | null {
  const latencies = players
    .map((player) => player.latencyEstimateMs)
    .filter((value): value is number => value !== null);

  if (latencies.length === 0) {
    return null;
  }

  return Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);
}

function formatFatalError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}

function formatCopyLabel(copyStatus: CopyStatus): string {
  switch (copyStatus) {
    case "copied": {
      return "Copied";
    }
    case "failed": {
      return "Copy failed";
    }
    default: {
      return "Copy URL";
    }
  }
}

function formatLatency(latencyMs: number | null): string {
  return latencyMs === null ? "n/a" : `${latencyMs} ms`;
}

function formatLifecycleLabel(value: HostSnapshot["lifecycle"]): string {
  return value.replaceAll("_", " ");
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function getHostApi(): HostApi | null {
  if (!("hostApi" in window)) {
    return null;
  }

  return typeof window.hostApi === "object" && window.hostApi !== null
    ? window.hostApi
    : null;
}

function getJoinUrlWarning(joinUrl: string): string | null {
  try {
    const url = new URL(joinUrl);

    if (
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1" &&
      url.hostname !== "0.0.0.0"
    ) {
      return null;
    }

    return "This join URL points to the local machine. Phones outside this network need RELAY_PUBLIC_BASE_URL or a public relay/tunnel.";
  } catch {
    return "The current join URL is invalid. Restart the session and verify the relay configuration.";
  }
}

function renderCentralPlaceholder(
  windowKind: HostWindowKind,
  message: string,
  tone: "error" | "hint" = "hint",
) {
  const className = tone === "error" ? "error-copy" : "hint-copy";

  return (
    <div
      className={
        windowKind === "central"
          ? "central-placeholder"
          : "central-preview-placeholder"
      }
    >
      <p className={className}>{message}</p>
    </div>
  );
}

function invokeHostAction(
  setFatalError: (value: string | null) => void,
  action: (hostApi: HostApi) => Promise<void>,
): void {
  const hostApi = getHostApi();

  if (hostApi === null) {
    setFatalError(
      "Host controls are unavailable because the preload bridge did not initialize.",
    );
    return;
  }

  void action(hostApi).catch((error: unknown) => {
    setFatalError(
      formatFatalError(
        error,
        "Failed to send a command to the Electron main process.",
      ),
    );
  });
}

function resolveGameLabel(
  availableGames: GameManifest[],
  selectedGame: string | null,
): string {
  if (selectedGame === null) {
    return "none";
  }

  return availableGames.find((game) => game.id === selectedGame)?.displayName ?? selectedGame;
}

function resolveModeratorName(snapshot: HostSnapshot): string {
  if (snapshot.moderatorId === null) {
    return "not set";
  }

  return snapshot.players.find((player) => player.playerId === snapshot.moderatorId)?.name ?? "not set";
}

function resolveWindowKind(): HostWindowKind {
  const params = new URLSearchParams(window.location.search);
  return params.get("view") === "central" ? "central" : "admin";
}

function toHubSession(
  snapshot: HostSnapshot,
  players: GamePlayerSnapshot[],
): NonNullable<GameCentralProps<Record<string, unknown>>["hubSession"]> {
  return {
    joinUrl: snapshot.joinUrl,
    lastRelayMessageAt: snapshot.lastRelayMessageAt,
    leaderboard: snapshot.leaderboard.map((entry) => ({ ...entry })),
    lifecycle: snapshot.lifecycle,
    matchStatus: { ...snapshot.matchStatus },
    moderatorId: snapshot.moderatorId,
    overlay: snapshot.overlay === null ? null : { ...snapshot.overlay },
    players,
    relayStatus: snapshot.relayStatus,
    selectedGame: snapshot.selectedGame,
    sessionId: snapshot.sessionId,
    statusBadges: snapshot.statusBadges.map((badge) => ({ ...badge })),
    updatedAt: snapshot.updatedAt,
  };
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText !== undefined) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function toGamePlayer(player: HostPlayerSnapshot): GamePlayerSnapshot {
  return {
    connected: player.connected,
    lastSeen: player.lastSeen,
    name: player.name,
    playerId: player.playerId,
    role: player.role,
    team: player.team,
  };
}
