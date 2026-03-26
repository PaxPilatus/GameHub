import { describe, expect, it } from "vitest";

import type { GamePlayerSnapshot } from "@game-hub/sdk";

import {
  PARTY_ROUND_COUNT,
  PARTY_SECONDS_ANSWER,
  createInitialPartyRpgEngineState,
  parseCharacterDraftPayload,
  reducePartyRpgEngineState,
  validateDraft,
  type PartyRpgCharacterDraft,
  type PartyRpgSituation,
} from "../src/reducer.js";
import { PLAYER_VOICE_A } from "../src/voices.js";

const SITUATIONS: PartyRpgSituation[] = [
  {
    id: "s1",
    prompt: "Test prompt one",
    tags: ["test"],
    title: "Situation 1",
  },
  {
    id: "s2",
    prompt: "Test prompt two",
    tags: ["test"],
    title: "Situation 2",
  },
];

const PLAYERS: GamePlayerSnapshot[] = [
  {
    connected: true,
    lastSeen: 1,
    name: "Alice",
    playerId: "p1",
    role: "player",
    team: "A",
  },
  {
    connected: true,
    lastSeen: 1,
    name: "Bob",
    playerId: "p2",
    role: "player",
    team: "B",
  },
];

function validDraft(overrides: Partial<PartyRpgCharacterDraft> = {}): PartyRpgCharacterDraft {
  return {
    backgroundId: "folk_hero",
    chosenName: "Zork",
    chosenSlogan: "Ich wuerfele wuerfeln!",
    classId: "fighter",
    flawId: "cannot_whisper",
    jobId: "smith",
    quirkId: "bows_on_intro",
    raceId: "human",
    signatureObjectId: "ominous_notebook",
    startItemId: "tent_hole_in_roof",
    voiceProfileId: PLAYER_VOICE_A,
    ...overrides,
  };
}

function ctx(nowMs: number) {
  return { nowMs, situations: SITUATIONS };
}

describe("party-rpg reducer", () => {
  it("moves to asset_generation when all players confirm character ready", () => {
    let state = createInitialPartyRpgEngineState([]);
    state = reducePartyRpgEngineState(
      state,
      { players: PLAYERS, seed: 42, type: "game_started" },
      ctx(0),
    );
    expect(state.publicState.stage).toBe("character_creation");

    const draft = validDraft();

    state = reducePartyRpgEngineState(
      state,
      {
        draft,
        playerId: "p1",
        players: PLAYERS,
        type: "character_submitted",
      },
      ctx(0),
    );
    state = reducePartyRpgEngineState(
      state,
      { playerId: "p1", players: PLAYERS, type: "character_ready" },
      ctx(0),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        draft: validDraft({
          chosenName: "Glorp",
          chosenSlogan: "Laut ist auch Taktik!",
          classId: "rogue",
          raceId: "goblin",
        }),
        playerId: "p2",
        players: PLAYERS,
        type: "character_submitted",
      },
      ctx(0),
    );
    state = reducePartyRpgEngineState(
      state,
      { playerId: "p2", players: PLAYERS, type: "character_ready" },
      ctx(0),
    );

    expect(state.publicState.stage).toBe("asset_generation");
  });

  it("applies character_ready in the same logical turn as character_submitted (Host-Kombi)", () => {
    let state = createInitialPartyRpgEngineState([]);
    state = reducePartyRpgEngineState(
      state,
      { players: PLAYERS, seed: 7, type: "game_started" },
      ctx(0),
    );
    const draft = validDraft();
    state = reducePartyRpgEngineState(
      state,
      {
        draft,
        playerId: "p1",
        players: PLAYERS,
        type: "character_submitted",
      },
      ctx(0),
    );
    state = reducePartyRpgEngineState(
      state,
      { playerId: "p1", players: PLAYERS, type: "character_ready" },
      ctx(0),
    );
    const row = state.publicState.playerRows.find((entry) => entry.playerId === "p1");
    expect(row?.characterReady).toBe(true);
  });

  it("enters answer_collection after round_intro timer and accepts private answers", () => {
    let state = createInitialPartyRpgEngineState([]);
    state = reducePartyRpgEngineState(
      state,
      { players: PLAYERS, seed: 99, type: "game_started" },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        draft: validDraft(),
        playerId: "p1",
        players: PLAYERS,
        type: "character_submitted",
      },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      { playerId: "p1", players: PLAYERS, type: "character_ready" },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        draft: validDraft({
          chosenName: "Glorp",
          chosenSlogan: "Laut ist auch Taktik!",
          classId: "rogue",
          raceId: "goblin",
        }),
        playerId: "p2",
        players: PLAYERS,
        type: "character_submitted",
      },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      { playerId: "p2", players: PLAYERS, type: "character_ready" },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        characters: state.publicState.characters.map((character) => ({
          ...character,
          assetStatus: "ready",
          summaryShort: "Kurzsummary",
        })),
        players: PLAYERS,
        type: "assets_ready",
      },
      ctx(1_000),
    );

    expect(state.publicState.stage).toBe("round_intro");
    state = reducePartyRpgEngineState(
      state,
      { players: PLAYERS, type: "skip_intro" },
      ctx(1_000),
    );
    expect(state.publicState.stage).toBe("answer_collection");
    expect(state.publicState.answerDeadlineMs).toBe(
      1_000 + PARTY_SECONDS_ANSWER * 1000,
    );

    state = reducePartyRpgEngineState(
      state,
      {
        answerText: "Ich buhle um eine Sonderaktion auf dem Minimarkt.",
        playerId: "p1",
        players: PLAYERS,
        type: "answer_submitted",
      },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        answerText: "Ich starte eine Petition fuer mehr Loottables.",
        playerId: "p2",
        players: PLAYERS,
        type: "answer_submitted",
      },
      ctx(1_000),
    );

    expect(state.publicState.stage).toBe("llm_enrichment");
    expect(state.privateAnswers.p1?.length).toBeGreaterThan(5);
  });

  it("does not advance to llm_enrichment until every playerRow has answered (connected flag ignored)", () => {
    const playersOneDisconnected: GamePlayerSnapshot[] = [
      { ...PLAYERS[0]!, connected: true },
      { ...PLAYERS[1]!, connected: false },
    ];
    let state = createInitialPartyRpgEngineState([]);
    state = reducePartyRpgEngineState(
      state,
      { players: playersOneDisconnected, seed: 100, type: "game_started" },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        draft: validDraft(),
        playerId: "p1",
        players: playersOneDisconnected,
        type: "character_submitted",
      },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      { playerId: "p1", players: playersOneDisconnected, type: "character_ready" },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        draft: validDraft({
          chosenName: "Glorp",
          chosenSlogan: "Laut ist auch Taktik!",
          classId: "rogue",
          raceId: "goblin",
        }),
        playerId: "p2",
        players: playersOneDisconnected,
        type: "character_submitted",
      },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      { playerId: "p2", players: playersOneDisconnected, type: "character_ready" },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        characters: state.publicState.characters.map((character) => ({
          ...character,
          assetStatus: "ready",
          summaryShort: "Kurzsummary",
        })),
        players: playersOneDisconnected,
        type: "assets_ready",
      },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      { players: playersOneDisconnected, type: "skip_intro" },
      ctx(1_000),
    );
    expect(state.publicState.stage).toBe("answer_collection");

    state = reducePartyRpgEngineState(
      state,
      {
        answerText: "Nur eine Antwort von p1.",
        playerId: "p1",
        players: playersOneDisconnected,
        type: "answer_submitted",
      },
      ctx(1_000),
    );
    expect(state.publicState.stage).toBe("answer_collection");
    expect(
      state.publicState.playerRows.filter((r) => r.submittedAnswer).length,
    ).toBe(1);
  });

  const PLAYERS_MOD_AND_PLAYER: GamePlayerSnapshot[] = [
    {
      connected: true,
      lastSeen: 1,
      name: "Mod",
      playerId: "p1",
      role: "moderator",
      team: "A",
    },
    {
      connected: true,
      lastSeen: 1,
      name: "Bob",
      playerId: "p2",
      role: "player",
      team: "B",
    },
  ];

  it("does not advance to llm_enrichment until moderator and player both answered", () => {
    let state = createInitialPartyRpgEngineState([]);
    state = reducePartyRpgEngineState(
      state,
      { players: PLAYERS_MOD_AND_PLAYER, seed: 101, type: "game_started" },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        draft: validDraft(),
        playerId: "p1",
        players: PLAYERS_MOD_AND_PLAYER,
        type: "character_submitted",
      },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      { playerId: "p1", players: PLAYERS_MOD_AND_PLAYER, type: "character_ready" },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        draft: validDraft({
          chosenName: "Glorp",
          chosenSlogan: "Laut ist auch Taktik!",
          classId: "rogue",
          raceId: "goblin",
        }),
        playerId: "p2",
        players: PLAYERS_MOD_AND_PLAYER,
        type: "character_submitted",
      },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      { playerId: "p2", players: PLAYERS_MOD_AND_PLAYER, type: "character_ready" },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      {
        characters: state.publicState.characters.map((character) => ({
          ...character,
          assetStatus: "ready",
          summaryShort: "Kurzsummary",
        })),
        players: PLAYERS_MOD_AND_PLAYER,
        type: "assets_ready",
      },
      ctx(1_000),
    );
    state = reducePartyRpgEngineState(
      state,
      { players: PLAYERS_MOD_AND_PLAYER, type: "skip_intro" },
      ctx(1_000),
    );
    expect(state.publicState.stage).toBe("answer_collection");
    expect(state.publicState.playerRows.length).toBe(2);

    state = reducePartyRpgEngineState(
      state,
      {
        answerText: "Nur Moderator antwortet.",
        playerId: "p1",
        players: PLAYERS_MOD_AND_PLAYER,
        type: "answer_submitted",
      },
      ctx(1_000),
    );
    expect(state.publicState.stage).toBe("answer_collection");

    state = reducePartyRpgEngineState(
      state,
      {
        answerText: "Spieler antwortet auch.",
        playerId: "p2",
        players: PLAYERS_MOD_AND_PLAYER,
        type: "answer_submitted",
      },
      ctx(1_000),
    );
    expect(state.publicState.stage).toBe("llm_enrichment");
  });

  it("next_reveal advances showcase through all players to judge_deliberation", () => {
    let state = createInitialPartyRpgEngineState([]);
    const entry = {
      audioCueText: null,
      judgeComment: null,
      narrationSegmentTexts: ["a1", "a2", "a3", "a4"],
      narrationText: "Show A",
      playerId: "p1",
      ttsReady: false,
    };
    state = {
      ...state,
      publicState: {
        ...state.publicState,
        roundCount: PARTY_ROUND_COUNT,
        roundIndex: 1,
        secondsRemaining: 10,
        showcaseEntries: [
          entry,
          {
            ...entry,
            narrationSegmentTexts: ["b1", "b2", "b3", "b4"],
            narrationText: "Show B",
            playerId: "p2",
          },
        ],
        showcaseIndex: 0,
        showcaseOrder: ["p1", "p2"],
        stage: "showcase",
      },
    };

    state = reducePartyRpgEngineState(
      state,
      { players: PLAYERS, type: "next_reveal" },
      ctx(0),
    );
    expect(state.publicState.stage).toBe("showcase");
    expect(state.publicState.showcaseIndex).toBe(1);

    state = reducePartyRpgEngineState(
      state,
      { players: PLAYERS, type: "next_reveal" },
      ctx(0),
    );
    expect(state.publicState.stage).toBe("judge_deliberation");
  });

  it("applies enrichment_ready and advances showcase order", () => {
    let state = createInitialPartyRpgEngineState([]);
    state = {
      ...state,
      enrichmentStarted: true,
      privateAnswers: { p1: "Antwort A", p2: "Antwort B" },
      publicState: {
        ...state.publicState,
        answerDeadlineMs: null,
        currentSituation: {
          id: SITUATIONS[0]!.id,
          prompt: SITUATIONS[0]!.prompt,
          title: SITUATIONS[0]!.title,
        },
        roundCount: PARTY_ROUND_COUNT,
        roundIndex: 1,
        sessionSeed: 1,
        stage: "llm_enrichment",
      },
    };

    state = reducePartyRpgEngineState(
      state,
      {
        entries: [
          {
            audioCueText: null,
            judgeComment: null,
            narrationSegmentTexts: ["a1", "a2", "a3", "a4"],
            narrationText: "Show A",
            playerId: "p1",
            ttsReady: false,
          },
          {
            audioCueText: null,
            judgeComment: null,
            narrationSegmentTexts: ["b1", "b2", "b3", "b4"],
            narrationText: "Show B",
            playerId: "p2",
            ttsReady: true,
          },
        ],
        players: PLAYERS,
        type: "enrichment_ready",
      },
      ctx(0),
    );

    expect(state.publicState.stage).toBe("showcase");
    expect(state.publicState.showcaseOrder).toEqual(["p1", "p2"]);
    expect(state.publicState.showcaseIndex).toBe(0);
  });

  it("validateDraft rejects short slogan and bad ids", () => {
    expect(
      validateDraft(
        validDraft({ chosenSlogan: "kurz", flawId: null }),
      ),
    ).not.toBeNull();
    expect(
      validateDraft(validDraft({ raceId: "not_a_race" })),
    ).not.toBeNull();
    expect(
      validateDraft(validDraft({ startItemId: null })),
    ).not.toBeNull();
    expect(validateDraft(validDraft())).toBeNull();
  });

  it("parseCharacterDraftPayload reads structured fields", () => {
    const draft = parseCharacterDraftPayload({
      backgroundId: "folk_hero",
      chosenName: "Neo",
      chosenSlogan: "Alles ist dramatisch genug.",
      classId: "bard",
      flawId: "forgets_names",
      jobId: "merchant",
      quirkId: "doors_are_symbolic",
      raceId: "elf",
      signatureObjectId: "dented_lute",
      startItemId: "dog_steals_food",
      voiceProfileId: "player_voice_b",
    });
    expect(draft?.raceId).toBe("elf");
    expect(draft?.chosenName).toBe("Neo");
    expect(validateDraft(draft!)).toBeNull();
  });
});
