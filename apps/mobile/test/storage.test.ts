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

    savePlayerToken(storage, "session-1", "token-1");

    expect(loadPlayerToken(storage, "session-1")).toBe("token-1");
    expect(buildPlayerTokenStorageKey("session-1")).toBe(
      "game-hub-player-token:session-1",
    );
  });

  it("clears an existing token", () => {
    const storage = new MemoryStorage();

    savePlayerToken(storage, "session-2", "token-2");
    clearPlayerToken(storage, "session-2");

    expect(loadPlayerToken(storage, "session-2")).toBeNull();
  });
});
