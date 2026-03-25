import type { HostSnapshot } from "../../src/types.js";

export interface CentralLeaderboardEntry {
  metricLabel: string;
  metricValue: string;
  name: string;
  playerId: string;
  status: string;
}

type LeaderboardSnapshot = Pick<HostSnapshot, "leaderboard">;

export function buildCentralLeaderboard(
  snapshot: LeaderboardSnapshot,
): CentralLeaderboardEntry[] {
  const metric = resolveMetric(snapshot.leaderboard);

  return snapshot.leaderboard.map((entry) => ({
    metricLabel: metric.label,
    metricValue: metric.format(entry),
    name: entry.name,
    playerId: entry.playerId,
    status: entry.status ?? (entry.connected ? "connected" : "offline"),
  }));
}

function resolveMetric(entries: HostSnapshot["leaderboard"]) {
  if (entries.some((entry) => entry.placement !== null)) {
    return {
      format: (entry: HostSnapshot["leaderboard"][number]) =>
        entry.placement === null ? "-" : `#${entry.placement}`,
      label: "place",
    };
  }

  if (entries.some((entry) => entry.wins > 0)) {
    return {
      format: (entry: HostSnapshot["leaderboard"][number]) => String(entry.wins),
      label: "wins",
    };
  }

  if (entries.some((entry) => entry.score !== 0)) {
    return {
      format: (entry: HostSnapshot["leaderboard"][number]) => String(entry.score),
      label: "score",
    };
  }

  return {
    format: (entry: HostSnapshot["leaderboard"][number]) => entry.team,
    label: "team",
  };
}
