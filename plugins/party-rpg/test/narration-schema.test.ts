import { describe, expect, it } from "vitest";

import { NarrationScriptSchema } from "@game-hub/ai-gateway";

describe("NarrationScriptSchema", () => {
  it("accepts a valid 4-segment alternating script", () => {
    const parsed = NarrationScriptSchema.parse({
      outcome: "success",
      playerId: "p1",
      rollSummary: "Wurf 12 vs DC 12 (success)",
      roundIndex: 1,
      segments: [
        { index: 1, speaker: "player", text: "Ich handle." },
        { index: 2, speaker: "judge", text: "Der Wuerfel faellt." },
        { index: 3, speaker: "player", text: "Aha." },
        { index: 4, speaker: "judge", text: "Erfolg." },
      ],
      sessionId: "42",
    });
    expect(parsed.playerId).toBe("p1");
    expect(parsed.segments).toHaveLength(4);
  });

  it("rejects wrong speaker order", () => {
    expect(() =>
      NarrationScriptSchema.parse({
        outcome: "fail",
        playerId: "p1",
        rollSummary: "x",
        roundIndex: 1,
        segments: [
          { index: 1, speaker: "judge", text: "bad" },
          { index: 2, speaker: "player", text: "bad" },
          { index: 3, speaker: "player", text: "bad" },
          { index: 4, speaker: "judge", text: "bad" },
        ],
        sessionId: "1",
      }),
    ).toThrow();
  });
});
