import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TriviaCentralView } from "../src/central.tsx";
import { TriviaMobileView } from "../src/mobile.tsx";

describe("trivia views", () => {
  it("falls back instead of crashing on an invalid central state payload", () => {
    const html = renderToStaticMarkup(
      React.createElement(TriviaCentralView, {
        gameState: { snakes: [] },
        hubSession: null,
        invokeHostAction: async () => undefined,
        phase: "game_finished",
        players: [],
      }),
    );

    expect(html).toContain("Trivia state pending...");
  });

  it("falls back instead of crashing on an invalid mobile state payload", () => {
    const html = renderToStaticMarkup(
      React.createElement(TriviaMobileView, {
        gameState: { snakes: [] },
        hubSession: null,
        phase: "game_running",
        playerId: "player-1",
        players: [],
        role: "player",
        sendInput: () => undefined,
      }),
    );

    expect(html).toContain("Trivia state pending...");
  });
});
