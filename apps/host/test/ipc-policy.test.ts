import { describe, expect, it } from "vitest";

import {
  assertWindowAccess,
  parseGameId,
  parsePluginAction,
  parsePlayerId,
} from "../src/ipc-policy.js";

describe("host IPC policy", () => {
  it("rejects admin-only actions from the central window", () => {
    expect(() =>
      assertWindowAccess("host:restart-session", "central", ["admin"]),
    ).toThrow(/not available/);
  });

  it("allows plugin actions from the central window", () => {
    expect(() =>
      assertWindowAccess("host:send-plugin-action", "central", ["admin", "central"]),
    ).not.toThrow();
  });

  it("accepts bounded game and player identifiers", () => {
    expect(parseGameId("snake")).toBe("snake");
    expect(parsePlayerId("player-1")).toBe("player-1");
  });

  it("validates plugin actions and JSON payloads", () => {
    expect(parsePluginAction("direction", { dir: "left" })).toEqual({
      action: "direction",
      payload: { dir: "left" },
    });
  });
});
