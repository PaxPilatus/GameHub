import { describe, expect, it } from "vitest";

import {
  buildJoinSearch,
  extractSessionIdFromJoinTarget,
  resolveSessionIdFromSearch,
} from "../src/join-session.js";

describe("join-session", () => {
  it("accepts a raw session ID", () => {
    expect(extractSessionIdFromJoinTarget("35fb14f7e386")).toBe("35fb14f7e386");
  });

  it("extracts a session ID from a full join URL", () => {
    expect(
      extractSessionIdFromJoinTarget(
        "https://relay.example.com/?sessionId=35fb14f7e386",
      ),
    ).toBe("35fb14f7e386");
  });

  it("extracts a session ID from a relative join URL", () => {
    expect(extractSessionIdFromJoinTarget("/?sessionId=35fb14f7e386")).toBe(
      "35fb14f7e386",
    );
  });

  it("rejects malformed input", () => {
    expect(extractSessionIdFromJoinTarget("not a join link")).toBeNull();
  });

  it("builds the canonical query string", () => {
    expect(buildJoinSearch("35fb14f7e386")).toBe("?sessionId=35fb14f7e386");
  });

  it("reports invalid session IDs from the query string", () => {
    expect(resolveSessionIdFromSearch("?sessionId=***")).toEqual({
      error: "The join link is invalid. Ask the host for a fresh session link.",
      sessionId: "",
    });
  });
});
