import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PartyCentralView from "../src/central.js";
import PartyMobileView from "../src/mobile.js";
import {
  createInitialPartyRpgEngineState,
  PARTY_SECONDS_SHOWCASE_STEP,
  type PartyRpgShowcaseEntry,
  type PartyRpgState,
} from "../src/reducer.js";

describe("party-rpg views", () => {
  it("central readiness lists union of session players and playerRows", () => {
    const engine = createInitialPartyRpgEngineState([]);
    const next = {
      ...engine,
      publicState: {
        ...engine.publicState,
        playerRows: [
          {
            characterReady: false,
            playerId: "p1",
            submittedAnswer: false,
          },
        ],
        stage: "character_creation" as const,
      },
    };
    const players = [
      {
        connected: true,
        lastSeen: 1,
        name: "Alice",
        playerId: "p1",
        role: "player" as const,
        team: "A" as const,
      },
      {
        connected: true,
        lastSeen: 1,
        name: "Bob",
        playerId: "p2",
        role: "player" as const,
        team: "B" as const,
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(PartyCentralView, {
        gameState: next.publicState,
        hubSession: null,
        invokeHostAction: async () => undefined,
        phase: "game_running",
        players,
      }),
    );
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
  });

  it("central readiness lists moderator and player from session", () => {
    const engine = createInitialPartyRpgEngineState([]);
    const next = {
      ...engine,
      publicState: {
        ...engine.publicState,
        playerRows: [
          {
            characterReady: false,
            playerId: "p1",
            submittedAnswer: false,
          },
          {
            characterReady: false,
            playerId: "p2",
            submittedAnswer: false,
          },
        ],
        stage: "character_creation" as const,
      },
    };
    const players = [
      {
        connected: true,
        lastSeen: 1,
        name: "Mod",
        playerId: "p1",
        role: "moderator" as const,
        team: "A" as const,
      },
      {
        connected: true,
        lastSeen: 1,
        name: "Bob",
        playerId: "p2",
        role: "player" as const,
        team: "B" as const,
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(PartyCentralView, {
        gameState: next.publicState,
        hubSession: null,
        invokeHostAction: async () => undefined,
        phase: "game_running",
        players,
      }),
    );
    expect(html).toContain("Mod");
    expect(html).toContain("Bob");
  });

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

  it("mobile answer_collection shows scenario title and prompt", () => {
    let engine = createInitialPartyRpgEngineState([]);
    engine = {
      ...engine,
      publicState: {
        ...engine.publicState,
        answerDeadlineMs: Date.now() + 60_000,
        currentSituation: {
          id: "s1",
          prompt: "Prompt fuer die Runde.",
          tags: [] as string[],
          title: "Szenario Titel",
        },
        playerRows: [
          {
            characterReady: true,
            playerId: "p1",
            submittedAnswer: false,
          },
        ],
        roundCount: 5,
        roundIndex: 1,
        stage: "answer_collection",
      },
    };
    const players = [
      {
        connected: true,
        lastSeen: 1,
        name: "Alice",
        playerId: "p1",
        role: "player" as const,
        team: "A" as const,
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(PartyMobileView, {
        gameState: engine.publicState,
        hubSession: null,
        phase: "game_running",
        playerId: "p1",
        players,
        role: "player",
        sendInput: () => undefined,
      }),
    );
    expect(html).toContain("Szenario Titel");
    expect(html).toContain("Prompt fuer die Runde.");
    expect(html).toMatch(/szenario|test%20szenario/);
  });

  it("central showcase renders narration segments for active player", () => {
    const engine = createInitialPartyRpgEngineState([]);
    const entry: PartyRpgShowcaseEntry = {
      audioCueText: null,
      judgeComment: null,
      narrationSegmentTexts: ["s0", "s1", "s2", "s3"],
      narrationText: "Show A",
      playerId: "p1",
      ttsReady: false,
    };
    const publicState: PartyRpgState = {
      ...engine.publicState,
      characters: [
        {
          archetype: null,
          assetStatus: "ready",
          displayName: "Held A",
          playerId: "p1",
          portraitEmoji: "🎭",
          slogan: "Los",
          summaryShort: "—",
          voiceProfileId: "player_voice_a",
        },
      ],
      roundCount: 5,
      roundIndex: 1,
      secondsRemaining: PARTY_SECONDS_SHOWCASE_STEP,
      showcaseEntries: [entry],
      showcaseIndex: 0,
      showcaseOrder: ["p1"],
      stage: "showcase",
    };
    const html = renderToStaticMarkup(
      React.createElement(PartyCentralView, {
        gameState: publicState,
        hubSession: null,
        invokeHostAction: async () => undefined,
        phase: "game_running",
        players: [
          {
            connected: true,
            lastSeen: 1,
            name: "Alice",
            playerId: "p1",
            role: "player" as const,
            team: "A" as const,
          },
        ],
      }),
    );
    expect(html).toContain("s0");
    expect(html).toContain("Rezitation");
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
