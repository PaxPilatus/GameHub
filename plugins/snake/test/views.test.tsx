import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { gamePlugin } from "../src/index.tsx";

describe("snake views", () => {
  it("falls back instead of crashing on an invalid central state payload", () => {
    const html = renderToStaticMarkup(
      React.createElement(gamePlugin.ui.central!, {
        gameState: { scores: [] },
        hubSession: null,
        invokeHostAction: async () => undefined,
        phase: "game_running",
        players: [],
      }),
    );

    expect(html).toContain("Snake state pending.");
  });

  it("renders the compact central stage without the old restart button", () => {
    const html = renderToStaticMarkup(
      React.createElement(gamePlugin.ui.central!, {
        gameState: {
          aliveCount: 1,
          grid: {
            height: 24,
            width: 40,
          },
          latestMessage: "Snake is live.",
          snakes: [
            {
              alive: true,
              color: "#f4a259",
              connected: true,
              direction: "right",
              head: { x: 4, y: 8 },
              length: 4,
              name: "Alice",
              playerId: "player-1",
              segments: [
                { x: 4, y: 8 },
                { x: 3, y: 8 },
                { x: 2, y: 8 },
                { x: 1, y: 8 },
              ],
              team: "A",
              wins: 2,
            },
          ],
          stage: "game_over",
          tick: 12,
          tickHz: 12,
          winnerPlayerId: "player-1",
          winnerTeam: "A",
        },
        hubSession: null,
        invokeHostAction: async () => undefined,
        phase: "game_finished",
        players: [],
      }),
    );

    expect(html).toContain("snake-central-stage");
    expect(html).toContain("Alice won the round.");
    expect(html).not.toContain("Restart Round");
  });
});
