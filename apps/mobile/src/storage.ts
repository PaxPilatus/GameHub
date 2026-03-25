const STORAGE_PREFIX = "game-hub-player-token";
const STORAGE_VERSION = 1;
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface StoredReconnectRecord {
  expiresAt: number;
  savedAt: number;
  token: string;
  version: number;
}

export function buildPlayerTokenStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId}`;
}

export function loadPlayerToken(
  storage: StorageLike,
  sessionId: string,
  now = Date.now(),
): string | null {
  if (sessionId === "") {
    return null;
  }

  const value = storage.getItem(buildPlayerTokenStorageKey(sessionId));

  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = parseReconnectRecord(value);

  if (parsed === null) {
    storage.removeItem(buildPlayerTokenStorageKey(sessionId));
    return null;
  }

  if (parsed.expiresAt <= now || parsed.token.trim() === "") {
    storage.removeItem(buildPlayerTokenStorageKey(sessionId));
    return null;
  }

  return parsed.token;
}

export function savePlayerToken(
  storage: StorageLike,
  sessionId: string,
  playerToken: string,
  now = Date.now(),
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): void {
  if (sessionId === "") {
    return;
  }

  const record: StoredReconnectRecord = {
    expiresAt: now + ttlMs,
    savedAt: now,
    token: playerToken,
    version: STORAGE_VERSION,
  };

  storage.setItem(
    buildPlayerTokenStorageKey(sessionId),
    JSON.stringify(record),
  );
}

export function clearPlayerToken(
  storage: StorageLike,
  sessionId: string,
): void {
  if (sessionId === "") {
    return;
  }

  storage.removeItem(buildPlayerTokenStorageKey(sessionId));
}

function parseReconnectRecord(value: string): StoredReconnectRecord | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredReconnectRecord>;

    if (
      parsed.version === STORAGE_VERSION &&
      typeof parsed.token === "string" &&
      typeof parsed.savedAt === "number" &&
      typeof parsed.expiresAt === "number"
    ) {
      return {
        expiresAt: parsed.expiresAt,
        savedAt: parsed.savedAt,
        token: parsed.token,
        version: parsed.version,
      };
    }
  } catch {
    // Fall through to legacy/plain-token migration.
  }

  const legacyToken = value.trim();

  if (legacyToken === "") {
    return null;
  }

  const savedAt = Date.now();
  return {
    expiresAt: savedAt + DEFAULT_TOKEN_TTL_MS,
    savedAt,
    token: legacyToken,
    version: STORAGE_VERSION,
  };
}
