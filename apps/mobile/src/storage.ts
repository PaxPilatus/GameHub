const STORAGE_PREFIX = "game-hub-player-token";

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export function buildPlayerTokenStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId}`;
}

export function loadPlayerToken(
  storage: StorageLike,
  sessionId: string,
): string | null {
  if (sessionId === "") {
    return null;
  }

  const value = storage.getItem(buildPlayerTokenStorageKey(sessionId));
  return value === null || value.trim() === "" ? null : value;
}

export function savePlayerToken(
  storage: StorageLike,
  sessionId: string,
  playerToken: string,
): void {
  if (sessionId === "") {
    return;
  }

  storage.setItem(buildPlayerTokenStorageKey(sessionId), playerToken);
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
