import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PartyCentralView from "../src/central.js";
import PartyMobileView from "../src/mobile.js";
import { createInitialPartyRpgEngineState } from "../src/reducer.js";

describe("party-rpg views", () => {
  it("central renders without crashing for minimal state", () => {
    const engine = createInitialPartyRpgEngineState([]);
    const html = renderToStaticMarkup(
      React.createElement(PartyCentralView, {
        gameState: engine.publicState,
        hubSession: null,
        invokeHostAction: async () => undefined,
        phase: "game_running",
        players: [],
      }),
    );
    expect(html).toContain("Party RPG");
  });

  it("mobile renders form hint when game is running", () => {
    const engine = createInitialPartyRpgEngineState([]);
    const next = {
      ...engine,
      publicState: {
        ...engine.publicState,
        stage: "character_creation" as const,
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(PartyMobileView, {
        gameState: next.publicState,
        hubSession: null,
        phase: "game_running",
        playerId: "p1",
        players: [],
        role: "player",
        sendInput: () => undefined,
      }),
    );
    expect(html).toContain("character_creation");
    expect(html).toContain("Baue deinen Helden");
    expect(html).toContain("Comedy-Stilprofil");
  });

  it("mobile shows ready panel when character is marked ready", () => {
    let engine = createInitialPartyRpgEngineState([]);
    engine = {
      ...engine,
      publicState: {
        ...engine.publicState,
        playerRows: [
          {
            characterReady: true,
            playerId: "p1",
            submittedAnswer: false,
          },
        ],
        stage: "character_creation",
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(PartyMobileView, {
        gameState: engine.publicState,
        hubSession: null,
        phase: "game_running",
        playerId: "p1",
        players: [],
        role: "player",
        sendInput: () => undefined,
      }),
    );
    expect(html).toContain("Profil gesendet");
  });
});
