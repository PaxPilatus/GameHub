export interface StorageLike {
    getItem(key: string): string | null;
    removeItem(key: string): void;
    setItem(key: string, value: string): void;
}
export declare function buildPlayerTokenStorageKey(sessionId: string): string;
export declare function loadPlayerToken(storage: StorageLike, sessionId: string, now?: number): string | null;
export declare function savePlayerToken(storage: StorageLike, sessionId: string, playerToken: string, now?: number, ttlMs?: number): void;
export declare function clearPlayerToken(storage: StorageLike, sessionId: string): void;
//# sourceMappingURL=storage.d.ts.map