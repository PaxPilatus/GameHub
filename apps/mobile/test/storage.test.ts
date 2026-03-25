import { describe, expect, it } from "vitest";

import {
  buildPlayerTokenStorageKey,
  clearPlayerToken,
  loadPlayerToken,
  savePlayerToken,
  type StorageLike,
} from "../src/storage.js";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("mobile token storage", () => {
  it("stores and reloads a player token per session", () => {
    const storage = new MemoryStorage();

    savePlayerToken(storage, "session-1", "token-1", 1_000, 10_000);

    expect(loadPlayerToken(storage, "session-1", 5_000)).toBe("token-1");
    expect(buildPlayerTokenStorageKey("session-1")).toBe(
      "game-hub-player-token:session-1",
    );
  });

  it("expires old reconnect records", () => {
    const storage = new MemoryStorage();

    savePlayerToken(storage, "session-1", "token-1", 1_000, 2_000);

    expect(loadPlayerToken(storage, "session-1", 3_001)).toBeNull();
    expect(storage.getItem(buildPlayerTokenStorageKey("session-1"))).toBeNull();
  });

  it("migrates legacy plain-token storage once and bounds it by age", () => {
    const storage = new MemoryStorage();
    storage.setItem(buildPlayerTokenStorageKey("session-legacy"), "legacy-token");

    expect(loadPlayerToken(storage, "session-legacy", 10_000)).toBe("legacy-token");
  });

  it("clears an existing token", () => {
    const storage = new MemoryStorage();

    savePlayerToken(storage, "session-2", "token-2");
    clearPlayerToken(storage, "session-2");

    expect(loadPlayerToken(storage, "session-2")).toBeNull();
  });
});
