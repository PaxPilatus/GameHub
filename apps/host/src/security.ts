import type { HostDiagnosticEvent, HostSnapshot } from "./types.js";

const REDACTED_VALUE = "[redacted]";
const SENSITIVE_KEY_PATTERNS = [
  "authorization",
  "cookie",
  "secret",
  "token",
];

export function sanitizeStructuredData<TValue>(value: TValue): TValue {
  return sanitizeValue(value, new WeakSet()) as TValue;
}

export function sanitizeDiagnosticEvent(
  event: HostDiagnosticEvent,
): HostDiagnosticEvent {
  return {
    ...event,
    data: sanitizeStructuredData(event.data),
  };
}

export function sanitizeHostSnapshot(snapshot: HostSnapshot): HostSnapshot {
  return {
    ...snapshot,
    gameState:
      snapshot.gameState === null
        ? null
        : sanitizeStructuredData(snapshot.gameState),
    leaderboard: snapshot.leaderboard.map((entry) => ({ ...entry })),
    matchStatus: { ...snapshot.matchStatus },
    overlay: snapshot.overlay === null ? null : { ...snapshot.overlay },
    players: snapshot.players.map((player) => ({ ...player })),
    statusBadges: snapshot.statusBadges.map((badge) => ({ ...badge })),
  };
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, seen));
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[circular]";
  }

  seen.add(value);
  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    output[key] = isSensitiveKey(key)
      ? REDACTED_VALUE
      : sanitizeValue(entry, seen);
  }

  seen.delete(value);
  return output;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}
