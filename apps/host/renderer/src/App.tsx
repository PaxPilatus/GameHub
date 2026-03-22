import { useEffect, useState, type ComponentType } from "react";

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

import { loadCentralPluginComponent } from "./plugin-loader.js";

const DIAGNOSTICS_LIMIT = 200;

type HostApi = Window["hostApi"];

export function App() {
  const [availableGames, setAvailableGames] = useState<GameManifest[]>([]);
  const [diagnostics, setDiagnostics] = useState<HostDiagnosticEvent[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [pluginLoadError, setPluginLoadError] = useState<string | null>(null);
  const [pluginQrCode, setPluginQrCode] = useState<string>("");
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

    void hostApi.getInitialState()
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
    if (snapshot?.joinUrl === null || snapshot?.joinUrl === undefined) {
      setPluginQrCode("");
      return;
    }

    let active = true;
    void QRCode.toDataURL(snapshot.joinUrl, {
      margin: 1,
      width: 280,
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
  }, [snapshot?.joinUrl]);

  useEffect(() => {
    if (snapshot?.selectedGame === null || snapshot?.selectedGame === undefined) {
      setCentralComponent(null);
      setPluginLoadError(null);
      return;
    }

    let active = true;
    void loadCentralPluginComponent(snapshot.selectedGame)
      .then((component) => {
        if (!active) {
          return;
        }

        setCentralComponent(() => component);
        setPluginLoadError(component === null ? `No central UI registered for ${snapshot.selectedGame}.` : null);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setCentralComponent(null);
        setPluginLoadError(error instanceof Error ? error.message : "Failed to load plugin UI.");
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
  const joinUrlWarning =
    snapshot.joinUrl === null ? null : getJoinUrlWarning(snapshot.joinUrl);
  const hostState =
    snapshot.sessionId === null
      ? null
      : {
          lifecycle: snapshot.lifecycle,
          moderatorId: snapshot.moderatorId,
          players,
          pluginState: snapshot.pluginState,
          relayStatus: snapshot.relayStatus,
          selectedGame: snapshot.selectedGame,
          sessionId: snapshot.sessionId,
        };

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
            <div>
              <p className="eyebrow">Game Hub Host</p>
              <h1>Central Screen + Admin</h1>
              <p className="hint-copy">
                {snapshot.joinUrl === null
                  ? "Creating join URL..."
                  : `Players join via ${snapshot.joinUrl}`}
              </p>
              {joinUrlWarning === null ? null : (
                <div className="warning-callout">
                  <strong>Public reachability warning</strong>
                  <p>{joinUrlWarning}</p>
                </div>
              )}
              <div className="status-grid">
                <StatusCard label="Session" value={snapshot.sessionId ?? "pending"} />
                <StatusCard label="Connection" value={snapshot.relayStatus} />
                <StatusCard label="Lifecycle" value={snapshot.lifecycle} />
                <StatusCard
                  label="Selected Game"
                  value={resolveGameLabel(availableGames, snapshot.selectedGame)}
                />
                <StatusCard label="Moderator" value={resolveModeratorName(snapshot)} />
                <StatusCard label="Avg Latency" value={formatLatency(averageLatencyMs)} />
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Admin</h2>
              <p className="hint-copy">
                Plugin selection, moderator and lifecycle control stay host-authoritative.
              </p>
            </div>
            <button type="button" onClick={() => invokeHostAction((hostApi) => hostApi.restartSession())}>
              Restart Session
            </button>
          </div>
          <div className="actions-grid">
            <select
              value={snapshot.selectedGame ?? ""}
              onChange={(event) => {
                if (event.target.value !== "") {
                  invokeHostAction((hostApi) => hostApi.selectGame(event.target.value));
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
              disabled={
                snapshot.selectedGame === null ||
                (snapshot.lifecycle !== "lobby" &&
                  snapshot.lifecycle !== "game_finished")
              }
              onClick={() => invokeHostAction((hostApi) => hostApi.startGame())}
            >
              Start Game
            </button>
            <button
              type="button"
              disabled={snapshot.lifecycle !== "game_running"}
              onClick={() => invokeHostAction((hostApi) => hostApi.stopGame())}
            >
              Stop Game
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Lobby</h2>
              <p className="hint-copy">
                Players, teams and roles are read from the host session store.
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
                          onClick={() => invokeHostAction((hostApi) => hostApi.setModerator(player.playerId))}
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
              <h2>Central Plugin View</h2>
              <p className="hint-copy">
                Mounted dynamically from the selected plugin export.
              </p>
            </div>
            <span className="badge">{snapshot.selectedGame ?? "none"}</span>
          </div>
          {snapshot.selectedGame === null ? (
            <p className="hint-copy">Select a game to mount its central UI.</p>
          ) : pluginLoadError !== null ? (
            <p className="error-copy">{pluginLoadError}</p>
          ) : CentralComponent === null ? (
            <p className="hint-copy">Loading plugin UI...</p>
          ) : (
            <CentralComponent
              hostState={hostState}
              invokeHostAction={(action: string, payload?: InputValue) => {
                invokeHostAction((hostApi) => hostApi.sendPluginAction(action, payload));
              }}
              phase={snapshot.lifecycle}
              players={players}
              pluginState={snapshot.pluginState}
              relayStatus={snapshot.relayStatus}
              sessionId={snapshot.sessionId}
            />
          )}
        </section>

        <section className="panel diagnostics-panel">
          <div className="panel-header">
            <div>
              <h2>Diagnostics</h2>
              <p className="hint-copy">Last {DIAGNOSTICS_LIMIT} host events. Latency is estimated from client timestamps to host receipt.</p>
            </div>
            <span className="badge">{`${diagnostics.length} events · ${formatLatency(averageLatencyMs)}`}</span>
          </div>
          <div className="diagnostics-list">
            {diagnostics.map((event) => (
              <article key={event.id} className={`diag diag-${event.level}`}>
                <header>
                  <strong>{event.type}</strong>
                  <span>{formatTime(event.timestamp)}</span>
                </header>
                <p>{event.message}</p>
                <pre>{JSON.stringify(event.data, null, 2)}</pre>
              </article>
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

  function invokeHostAction(action: (hostApi: HostApi) => Promise<void>): void {
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

function formatLatency(latencyMs: number | null): string {
  return latencyMs === null ? "n/a" : `${latencyMs} ms`;
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

