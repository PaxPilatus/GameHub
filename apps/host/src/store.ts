import type {
  GameMatchStatus,
  GameResultEvent,
  GameUiBadge,
  GameUiOverlay,
  SessionLeaderboardEntry,
} from "@game-hub/sdk";

import type { HostPlayerSnapshot, HostSnapshot, PlayerTeam } from "./types.js";

export function createInitialHostSnapshot(now: number): HostSnapshot {
  return {
    gameState: null,
    joinUrl: null,
    lastRelayMessageAt: null,
    leaderboard: [],
    lifecycle: "idle",
    matchStatus: createInitialMatchStatus(),
    moderatorId: null,
    overlay: null,
    players: [],
    relayStatus: "disconnected",
    selectedGame: null,
    sessionId: null,
    statusBadges: [],
    updatedAt: now,
  };
}

export class HostSessionStore {
  private snapshot: HostSnapshot;

  constructor(now: number) {
    this.snapshot = createInitialHostSnapshot(now);
  }

  getSnapshot(): HostSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  applyResultEvent(event: GameResultEvent, now: number): HostSnapshot {
    switch (event.type) {
      case "award_player_points": {
        return this.setLeaderboard(
          this.snapshot.leaderboard.map((entry) =>
            entry.playerId === event.playerId
              ? {
                  ...entry,
                  score: entry.score + (event.points ?? 0),
                }
              : entry,
          ),
          now,
        );
      }
      case "award_team_points": {
        return this.setLeaderboard(
          this.snapshot.leaderboard.map((entry) =>
            entry.team === event.team
              ? {
                  ...entry,
                  teamScore: entry.teamScore + (event.points ?? 0),
                }
              : entry,
          ),
          now,
        );
      }
      case "clear_leaderboard": {
        return this.setLeaderboard(
          syncLeaderboardEntries(this.snapshot.players, []),
          now,
        );
      }
      case "end_match": {
        return this.setMatchStatus(
          {
            message: event.message ?? null,
            state: "match_finished",
            title: event.title ?? "Match finished",
          },
          now,
        );
      }
      case "end_round": {
        return this.setMatchStatus(
          {
            message: event.message ?? null,
            state: "round_finished",
            title: event.title ?? "Round finished",
          },
          now,
        );
      }
      case "record_player_win": {
        return this.setLeaderboard(
          this.snapshot.leaderboard.map((entry) =>
            entry.playerId === event.playerId
              ? {
                  ...entry,
                  wins: entry.wins + 1,
                }
              : entry,
          ),
          now,
        );
      }
      case "record_placement": {
        return this.setLeaderboard(
          this.snapshot.leaderboard.map((entry) =>
            entry.playerId === event.playerId
              ? {
                  ...entry,
                  placement: event.placement ?? null,
                }
              : entry,
          ),
          now,
        );
      }
      case "set_player_score": {
        return this.setLeaderboard(
          this.snapshot.leaderboard.map((entry) =>
            entry.playerId === event.playerId
              ? {
                  ...entry,
                  score: event.points ?? entry.score,
                }
              : entry,
          ),
          now,
        );
      }
      case "set_player_status": {
        return this.setLeaderboard(
          this.snapshot.leaderboard.map((entry) =>
            entry.playerId === event.playerId
              ? {
                  ...entry,
                  status: event.status ?? null,
                }
              : entry,
          ),
          now,
        );
      }
      case "set_team_score": {
        return this.setLeaderboard(
          this.snapshot.leaderboard.map((entry) =>
            entry.team === event.team
              ? {
                  ...entry,
                  teamScore: event.points ?? entry.teamScore,
                }
              : entry,
          ),
          now,
        );
      }
      default: {
        return this.getSnapshot();
      }
    }
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

  publishStatusBadges(badges: GameUiBadge[], now: number): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      statusBadges: badges.map((badge) => ({ ...badge })),
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
      gameState: null,
      joinUrl: params.joinUrl,
      lastRelayMessageAt: null,
      leaderboard: [],
      lifecycle: "idle",
      matchStatus: createInitialMatchStatus(),
      moderatorId: null,
      overlay: null,
      players: [],
      relayStatus: "creating_session",
      selectedGame: null,
      sessionId: params.sessionId,
      statusBadges: [],
      updatedAt: params.now,
    };

    return this.getSnapshot();
  }

  setGameState(
    gameState: Record<string, unknown> | null,
    now: number,
  ): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      gameState: gameState === null ? null : structuredClone(gameState),
      updatedAt: now,
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

  setMatchStatus(matchStatus: GameMatchStatus, now: number): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      matchStatus: { ...matchStatus },
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  setModerator(playerId: string, now: number): HostSnapshot {
    const players: HostPlayerSnapshot[] = this.snapshot.players.map((player) => ({
      ...player,
      role: player.playerId === playerId ? "moderator" : "player",
    }));

    this.snapshot = {
      ...this.snapshot,
      leaderboard: syncLeaderboardEntries(players, this.snapshot.leaderboard),
      moderatorId: playerId,
      players,
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  setOverlay(overlay: GameUiOverlay | null, now: number): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      overlay: overlay === null ? null : { ...overlay },
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
      gameState: null,
      leaderboard: syncLeaderboardEntries(this.snapshot.players, []),
      lifecycle,
      matchStatus: createInitialMatchStatus(),
      overlay: null,
      selectedGame: gameId,
      statusBadges: [],
      updatedAt: now,
    };

    return this.getSnapshot();
  }

  terminate(now: number): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      gameState: null,
      lifecycle: "terminated",
      matchStatus: createInitialMatchStatus(),
      overlay: null,
      relayStatus: "disconnected",
      statusBadges: [],
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
      });
    }

    const sortedPlayers = sortPlayers(players);
    const moderatorId =
      this.snapshot.moderatorId ??
      sortedPlayers.find((player) => player.role === "moderator")?.playerId ??
      null;

    this.snapshot = {
      ...this.snapshot,
      leaderboard: syncLeaderboardEntries(sortedPlayers, this.snapshot.leaderboard),
      lifecycle: this.snapshot.lifecycle === "idle" ? "lobby" : this.snapshot.lifecycle,
      moderatorId,
      players: sortedPlayers,
      updatedAt: params.lastSeen,
    };

    return this.getSnapshot();
  }

  updatePlayerConnection(params: {
    connected: boolean;
    lastSeen: number;
    playerId: string;
  }): HostSnapshot {
    const players = sortPlayers(
      this.snapshot.players.map((player) =>
        player.playerId === params.playerId
          ? {
              ...player,
              connected: params.connected,
              lastSeen: params.lastSeen,
            }
          : player,
      ),
    );

    this.snapshot = {
      ...this.snapshot,
      leaderboard: syncLeaderboardEntries(players, this.snapshot.leaderboard),
      players,
      updatedAt: params.lastSeen,
    };

    return this.getSnapshot();
  }

  private setLeaderboard(
    leaderboard: SessionLeaderboardEntry[],
    now: number,
  ): HostSnapshot {
    this.snapshot = {
      ...this.snapshot,
      leaderboard: sortLeaderboardEntries(leaderboard),
      updatedAt: now,
    };

    return this.getSnapshot();
  }
}

function createInitialMatchStatus(): GameMatchStatus {
  return {
    message: null,
    state: "idle",
    title: null,
  };
}

function cloneSnapshot(snapshot: HostSnapshot): HostSnapshot {
  return {
    ...snapshot,
    gameState:
      snapshot.gameState === null ? null : structuredClone(snapshot.gameState),
    leaderboard: snapshot.leaderboard.map((entry) => ({ ...entry })),
    matchStatus: { ...snapshot.matchStatus },
    overlay: snapshot.overlay === null ? null : { ...snapshot.overlay },
    players: snapshot.players.map((player) => ({ ...player })),
    statusBadges: snapshot.statusBadges.map((badge) => ({ ...badge })),
  };
}

function createLeaderboardEntry(player: HostPlayerSnapshot): SessionLeaderboardEntry {
  return {
    connected: player.connected,
    name: player.name,
    placement: null,
    playerId: player.playerId,
    role: player.role,
    score: 0,
    status: null,
    team: player.team,
    teamScore: 0,
    wins: 0,
  };
}

function selectNextTeam(players: HostPlayerSnapshot[]): PlayerTeam {
  const teamACount = players.filter((player) => player.team === "A").length;
  const teamBCount = players.filter((player) => player.team === "B").length;

  return teamACount <= teamBCount ? "A" : "B";
}

function sortLeaderboardEntries(
  entries: SessionLeaderboardEntry[],
): SessionLeaderboardEntry[] {
  return [...entries].sort((left, right) => {
    if (left.placement !== null || right.placement !== null) {
      if (left.placement === null) {
        return 1;
      }

      if (right.placement === null) {
        return -1;
      }

      const placementDelta = left.placement - right.placement;
      if (placementDelta !== 0) {
        return placementDelta;
      }
    }

    const winDelta = right.wins - left.wins;
    if (winDelta !== 0) {
      return winDelta;
    }

    const scoreDelta = right.score - left.score;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const teamScoreDelta = right.teamScore - left.teamScore;
    if (teamScoreDelta !== 0) {
      return teamScoreDelta;
    }

    return left.name.localeCompare(right.name);
  });
}

function sortPlayers(players: HostPlayerSnapshot[]): HostPlayerSnapshot[] {
  return [...players].sort((left, right) => left.name.localeCompare(right.name));
}

function syncLeaderboardEntries(
  players: HostPlayerSnapshot[],
  existingEntries: SessionLeaderboardEntry[],
): SessionLeaderboardEntry[] {
  const existingByPlayerId = new Map(
    existingEntries.map((entry) => [entry.playerId, entry] as const),
  );

  return sortLeaderboardEntries(
    players.map((player) => {
      const existingEntry = existingByPlayerId.get(player.playerId);
      const entry = existingEntry === undefined ? createLeaderboardEntry(player) : existingEntry;

      return {
        ...entry,
        connected: player.connected,
        name: player.name,
        playerId: player.playerId,
        role: player.role,
        team: player.team,
      };
    }),
  );
}


