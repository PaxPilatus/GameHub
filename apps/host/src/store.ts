import type { HostPlayerSnapshot, HostSnapshot, PlayerTeam } from "./types.js";

export function createInitialHostSnapshot(now: number): HostSnapshot {
  return {
    joinUrl: null,
    lastRelayMessageAt: null,
    lifecycle: "idle",
    moderatorId: null,
    players: [],
    pluginState: null,
    relayStatus: "disconnected",
    selectedGame: null,
    sessionId: null,
    updatedAt: now,
  };
}

export class HostSessionStore {
  private snapshot: HostSnapshot;

  constructor(now: number) {
    this.snapshot = createInitialHostSnapshot(now);
  }

  getSnapshot(): HostSnapshot {
    return {
      ...this.snapshot,
      players: this.snapshot.players.map((player) => ({ ...player })),
      pluginState:
        this.snapshot.pluginState === null
          ? null
          : { ...this.snapshot.pluginState },
    };
  }

  markClosing(now: number): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      lifecycle: "closing",
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  markRelayStatus(
    relayStatus: HostSnapshot["relayStatus"],
    now: number,
  ): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      relayStatus,
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  noteRelayMessage(now: number): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      lastRelayMessageAt: now,
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  recordPlayerLatency(
    playerId: string,
    latencyEstimateMs: number,
    now: number,
  ): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      players: sortPlayers(
        this.snapshot.players.map((player) =>
          player.playerId === playerId
            ? {
                ...player,
                latencyEstimateMs,
              }
            : player,
        ),
      ),
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  resetSession(params: {
    joinUrl: string;
    now: number;
    sessionId: string;
  }): HostSnapshot {
    this.snapshot = {
      joinUrl: params.joinUrl,
      lastRelayMessageAt: null,
      lifecycle: "idle",
      moderatorId: null,
      players: [],
      pluginState: null,
      relayStatus: "creating_session",
      selectedGame: null,
      sessionId: params.sessionId,
      updatedAt: params.now,
    };

    return this.getSnapshot();
  }

  setLifecycle(lifecycle: HostSnapshot["lifecycle"], now: number): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      lifecycle,
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  setModerator(playerId: string, now: number): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      moderatorId: playerId,
      players: this.snapshot.players.map((player) => ({
        ...player,
        role: player.playerId === playerId ? "moderator" : "player",
      })),
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  setPluginState(
    pluginState: Record<string, unknown> | null,
    now: number,
  ): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      pluginState: pluginState === null ? null : { ...pluginState },
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  setSelectedGame(gameId: string, now: number): HostSnapshot {
    const lifecycle =
      this.snapshot.lifecycle === "game_finished"
        ? "lobby"
        : this.snapshot.lifecycle;

    this.snapshot = {
      ...this.snapshot,
      lifecycle,
      selectedGame: gameId,
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  terminate(now: number): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      lifecycle: "terminated",
      pluginState: null,
      relayStatus: "disconnected",
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  upsertPlayer(params: {
    connected: boolean;
    lastSeen: number;
    name: string;
    playerId: string;
    reconnect: boolean;
    token: string | null;
  }): HostSnapshot {
    const players = [...this.snapshot.players];
    const existingIndex = players.findIndex(
      (player) => player.playerId === params.playerId,
    );

    if (existingIndex >= 0) {
      const existingPlayer = players[existingIndex];

      if (existingPlayer !== undefined) {
        const updatedPlayer: HostPlayerSnapshot = {
          connected: params.connected,
          lastSeen: params.lastSeen,
          latencyEstimateMs: existingPlayer.latencyEstimateMs,
          name: params.name,
          playerId: existingPlayer.playerId,
          role: existingPlayer.role,
          team: existingPlayer.team,
          token: params.token ?? existingPlayer.token,
        };

        players[existingIndex] = updatedPlayer;
      }
    } else {
      const team = selectNextTeam(players);
      const role =
        this.snapshot.moderatorId === null && !params.reconnect
          ? "moderator"
          : "player";

      players.push({
        connected: params.connected,
        lastSeen: params.lastSeen,
        latencyEstimateMs: null,
        name: params.name,
        playerId: params.playerId,
        role,
        team,
        token: params.token,
      });
    }

    const moderatorId =
      this.snapshot.moderatorId ??
      players.find((player) => player.role === "moderator")?.playerId ??
      null;

    this.snapshot = {
      ...this.snapshot,
      lifecycle: this.snapshot.lifecycle === "idle" ? "lobby" : this.snapshot.lifecycle,
      moderatorId,
      players: sortPlayers(players),
      updatedAt: params.lastSeen,
    };

    return this.getSnapshot();
  }

  updatePlayerConnection(params: {
    connected: boolean;
    lastSeen: number;
    playerId: string;
  }): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      players: sortPlayers(
        this.snapshot.players.map((player) =>
          player.playerId === params.playerId
            ? {
                ...player,
                connected: params.connected,
                lastSeen: params.lastSeen,
              }
            : player,
        ),
      ),
      updatedAt: params.lastSeen,
    };

    return this.getSnapshot();
  }
}

function selectNextTeam(players: HostPlayerSnapshot[]): PlayerTeam {
  const teamACount = players.filter((player) => player.team === "A").length;
  const teamBCount = players.filter((player) => player.team === "B").length;

  return teamACount <= teamBCount ? "A" : "B";
}

function sortPlayers(players: HostPlayerSnapshot[]): HostPlayerSnapshot[] {
  return [...players].sort((left, right) => left.name.localeCompare(right.name));
}