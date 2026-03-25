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

  it("renders item toggles and winner copy in central view", () => {
    const html = renderToStaticMarkup(
      React.createElement(gamePlugin.ui.central!, {
        gameState: {
          aliveCount: 1,
          countdownRemaining: null,
          foods: [],
          grid: {
            height: 24,
            width: 40,
          },
          itemSettings: {
            boost: true,
            magnet: false,
            shield: true,
          },
          items: [],
          coinrush: null,
          coins: [],
          latestMessage: "Alice won the round.",
          secretQuestRoundSummary: null,
          secretQuestSettings: { enabled: true },
          roundMode: "standard",
          roundSecondsRemaining: 0,
          showIdentityLabels: false,
          snakes: [
            {
              activeEffects: [],
              alive: true,
              coinCount: 0,
              color: "#f4a259",
              connected: true,
              direction: "right",
              head: { x: 4, y: 8 },
              length: 4,
              name: "Alice",
              playerId: "player-1",
              respawnTicksRemaining: null,
              score: 9,
              segments: [
                { x: 4, y: 8 },
                { x: 3, y: 8 },
                { x: 2, y: 8 },
                { x: 1, y: 8 },
              ],
              spawnProtectionTicksRemaining: 0,
              speedBank: 0,
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
    expect(html).toContain("Boost");
    expect(html).toContain("Shield");
    expect(html).toContain("Coinrush");
    expect(html).toContain("Secret Quests");
  });

  it("renders host-control read-only hint in central window mode", () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          search: "?view=central",
        },
      },
      writable: true,
    });

    try {
      const html = renderToStaticMarkup(
        React.createElement(gamePlugin.ui.central!, {
          gameState: {
            aliveCount: 1,
            countdownRemaining: null,
            foods: [],
            grid: {
              height: 24,
              width: 40,
            },
            itemSettings: {
              boost: true,
              magnet: true,
              shield: true,
            },
            items: [],
            coinrush: null,
            coins: [],
            latestMessage: "Read-only preview.",
            secretQuestRoundSummary: null,
            secretQuestSettings: { enabled: false },
            roundMode: "standard",
            roundSecondsRemaining: 90,
            showIdentityLabels: false,
            snakes: [],
            stage: "running",
            tick: 3,
            tickHz: 12,
            winnerPlayerId: null,
            winnerTeam: null,
          },
          hubSession: null,
          invokeHostAction: async () => undefined,
          phase: "game_running",
          players: [],
        }),
      );

      expect(html).toContain("Central view is read-only for host controls.");
    } finally {
      if (originalWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
          writable: true,
        });
      }
    }
  });
});
