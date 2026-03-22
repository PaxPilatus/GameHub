const STORAGE_PREFIX = "game-hub-player-token";
export function buildPlayerTokenStorageKey(sessionId) {
    return `${STORAGE_PREFIX}:${sessionId}`;
}
export function loadPlayerToken(storage, sessionId) {
    if (sessionId === "") {
        return null;
    }
    const value = storage.getItem(buildPlayerTokenStorageKey(sessionId));
    return value === null || value.trim() === "" ? null : value;
}
export function savePlayerToken(storage, sessionId, playerToken) {
    if (sessionId === "") {
        return;
    }
    storage.setItem(buildPlayerTokenStorageKey(sessionId), playerToken);
}
export function clearPlayerToken(storage, sessionId) {
    if (sessionId === "") {
        return;
    }
    storage.removeItem(buildPlayerTokenStorageKey(sessionId));
}
//# sourceMappingURL=storage.js.map