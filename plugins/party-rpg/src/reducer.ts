import type { GamePlayerSnapshot } from "@game-hub/sdk";
import type { PlayerRole } from "@game-hub/protocol";

import { CHARACTER_CREATION_CONTENT, contentOptionById } from "./character-content.js";
import { PLAYER_VOICE_A, PLAYER_VOICE_B, normalizePlayerVoiceProfileId } from "./voices.js";
import { buildCharacterSummaryPreview } from "./character-summary-preview.js";
import type { CharacterProfileDraft, ContentOption } from "./character-models.js";

export const PARTY_SUBMIT_CHARACTER = "submit_character_profile";
export const PARTY_CONFIRM_READY = "confirm_character_ready";
export const PARTY_SUBMIT_ANSWER = "submit_round_answer";
export const PARTY_CONTINUE_ROUND = "continue_to_next_round";
export const PARTY_RESTART = "restart";
export const PARTY_HOST_SKIP_INTRO = "skip_intro";
export const PARTY_HOST_NEXT_REVEAL = "next_reveal";

export const PARTY_ROUND_COUNT = 5;
export const PARTY_SECONDS_CHARACTER_PHASE = 180;
export const PARTY_SECONDS_ROUND_INTRO = 12;
export const PARTY_SECONDS_ANSWER = 75;
export const PARTY_SECONDS_SHOWCASE_STEP = 10;
export const PARTY_SECONDS_JUDGE = 8;
export const PARTY_SECONDS_ROUND_RESULT = 20;
export const PARTY_SECONDS_ASSET_FALLBACK = 45;

export const PARTY_POINTS_ROUND_WIN = 2;

/** Party-RPG-Mitspieler: erster Join ist oft `moderator`, zweiter `player` — beide spielen mit. */
export function isPartyRpgParticipantRole(role: PlayerRole): boolean {
  return role === "player" || role === "moderator";
}

export type PartyRpgStage =
  | "lobby"
  | "character_creation"
  | "asset_generation"
  | "round_intro"
  | "answer_collection"
  | "llm_enrichment"
  | "showcase"
  | "judge_deliberation"
  | "round_result"
  | "match_result";

/** Strukturiertes Charakterprofil (Wizard); `chosenName` / `chosenSlogan` sind die sichtbaren Texte. */
export type PartyRpgCharacterDraft = CharacterProfileDraft;

export interface PartyRpgCharacterPublic {
  playerId: string;
  displayName: string;
  archetype: string | null;
  slogan: string;
  summaryShort: string;
  portraitEmoji: string;
  assetStatus: "pending" | "ready" | "error";
  /** TTS only — `player_voice_a` | `player_voice_b`. */
  voiceProfileId: string;
}

export interface PartyRpgPlayerRow {
  playerId: string;
  characterReady: boolean;
  submittedAnswer: boolean;
}

export interface PartyRpgShowcaseEntry {
  playerId: string;
  narrationText: string;
  audioCueText: string | null;
  judgeComment: string | null;
  /** All four segment texts in order (player/judge alternating). */
  narrationSegmentTexts: string[];
  ttsReady: boolean;
}

export interface PartyRpgSituation {
  id: string;
  title: string;
  prompt: string;
  tags: string[];
}

export type PartyRpgPipelineJobStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "invalidated";

export type PartyRpgJudgePipelineStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface PartyRpgState extends Record<string, unknown> {
  answerDeadlineMs: number | null;
  characters: PartyRpgCharacterPublic[];
  currentSituation: { id: string; title: string; prompt: string; tags: string[] } | null;
  judgeWinnerId: string | null;
  latestMessage: string;
  llmMessage: string | null;
  matchComplete: boolean;
  playerRows: PartyRpgPlayerRow[];
  roundCount: number;
  roundIndex: number;
  roundWinnerId: string | null;
  secondsRemaining: number;
  sessionSeed: number;
  showcaseEntries: PartyRpgShowcaseEntry[];
  showcaseIndex: number;
  showcaseOrder: string[];
  stage: PartyRpgStage;
  narrationStatusByPlayerId: Record<string, PartyRpgPipelineJobStatus>;
  ttsStatusByPlayerId: Record<string, PartyRpgPipelineJobStatus>;
  judgePipelineStatus: PartyRpgJudgePipelineStatus;
}

export interface PartyRpgEngineState {
  assetJobStarted: boolean;
  characterDraftByPlayer: Record<string, PartyRpgCharacterDraft>;
  enrichmentResolved: boolean;
  enrichmentStarted: boolean;
  judgeResolved: boolean;
  judgeStarted: boolean;
  usedSituationIds: string[];
  llmEpoch: number;
  privateAnswers: Record<string, string>;
  publicState: PartyRpgState;
}

export type PartyRpgEvent =
  | { players: GamePlayerSnapshot[]; type: "game_started"; seed: number }
  | { players: GamePlayerSnapshot[]; type: "game_stopped" }
  | { players: GamePlayerSnapshot[]; type: "session_synced" }
  | { players: GamePlayerSnapshot[]; type: "tick" }
  | { players: GamePlayerSnapshot[]; type: "restart_requested"; seed: number }
  | {
      draft: PartyRpgCharacterDraft;
      playerId: string;
      players: GamePlayerSnapshot[];
      type: "character_submitted";
    }
  | {
      playerId: string;
      players: GamePlayerSnapshot[];
      type: "character_ready";
    }
  | {
      answerText: string;
      playerId: string;
      players: GamePlayerSnapshot[];
      type: "answer_submitted";
    }
  | { players: GamePlayerSnapshot[]; type: "continue_round" }
  | { players: GamePlayerSnapshot[]; type: "skip_intro" }
  | { players: GamePlayerSnapshot[]; type: "next_reveal" }
  | {
      characters: PartyRpgCharacterPublic[];
      players: GamePlayerSnapshot[];
      type: "assets_ready";
    }
  | {
      entries: PartyRpgShowcaseEntry[];
      players: GamePlayerSnapshot[];
      type: "enrichment_ready";
    }
  | {
      commentsByPlayerId: Record<string, string>;
      players: GamePlayerSnapshot[];
      type: "judge_completed";
      winnerId: string;
    }
  | { players: GamePlayerSnapshot[]; type: "enrichment_timeout" }
  | { players: GamePlayerSnapshot[]; type: "force_leave_asset_generation" }
  | {
      playerId: string;
      players: GamePlayerSnapshot[];
      status: PartyRpgPipelineJobStatus;
      type: "pipeline_narration_status";
    }
  | {
      playerId: string;
      players: GamePlayerSnapshot[];
      status: PartyRpgPipelineJobStatus;
      type: "pipeline_tts_status";
    }
  | {
      players: GamePlayerSnapshot[];
      status: PartyRpgJudgePipelineStatus;
      type: "pipeline_judge_status";
    }
  | { playerId: string; players: GamePlayerSnapshot[]; type: "showcase_tts_ready" };

export interface PartyRpgReducerContext {
  nowMs: number;
  situations: PartyRpgSituation[];
}

export function createInitialPartyRpgEngineState(
  players: GamePlayerSnapshot[],
): PartyRpgEngineState {
  return {
    assetJobStarted: false,
    characterDraftByPlayer: {},
    enrichmentResolved: false,
    enrichmentStarted: false,
    judgeResolved: false,
    judgeStarted: false,
    llmEpoch: 0,
    privateAnswers: {},
    publicState: createLobbyPublicState(players),
    usedSituationIds: [],
  };
}

function createLobbyPublicState(players: GamePlayerSnapshot[]): PartyRpgState {
  return {
    answerDeadlineMs: null,
    characters: [],
    currentSituation: null,
    judgeWinnerId: null,
    latestMessage: "Wartet auf Start durch den Host.",
    llmMessage: null,
    matchComplete: false,
    playerRows: buildPlayerRows(players, { answers: false, ready: false }),
    roundCount: PARTY_ROUND_COUNT,
    roundIndex: 0,
    roundWinnerId: null,
    secondsRemaining: 0,
    sessionSeed: 0,
    showcaseEntries: [],
    showcaseIndex: 0,
    showcaseOrder: [],
    stage: "lobby",
    judgePipelineStatus: "idle",
    narrationStatusByPlayerId: {},
    ttsStatusByPlayerId: {},
  };
}

export function reducePartyRpgEngineState(
  state: PartyRpgEngineState,
  event: PartyRpgEvent,
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  switch (event.type) {
    case "game_started":
      return startMatch(state, event.players, event.seed, context);
    case "restart_requested":
      return startMatch(state, event.players, event.seed, context);
    case "game_stopped":
      return stopMatch(state, event.players);
    case "session_synced":
      return syncPlayers(state, event.players, context);
    case "tick":
      return advanceTimers(state, event.players, context);
    case "character_submitted":
      return registerCharacterDraft(state, event, context);
    case "character_ready":
      return markCharacterReady(state, event, context);
    case "answer_submitted":
      return registerAnswer(state, event, context);
    case "continue_round":
      return continueRound(state, event.players, context);
    case "skip_intro":
      return skipIntro(state, event.players, context);
    case "next_reveal":
      return advanceShowcase(state, event.players, context);
    case "assets_ready":
      return applyAssetsReady(state, event, context);
    case "enrichment_ready":
      return applyEnrichmentReady(state, event, context);
    case "judge_completed":
      return applyJudgeCompleted(state, event, context);
    case "enrichment_timeout":
      return applyEnrichmentTimeout(state, event.players, context);
    case "force_leave_asset_generation":
      return forceLeaveAssetGeneration(state, event.players, context);
    case "pipeline_narration_status":
      return applyPipelineNarrationStatus(state, event);
    case "pipeline_tts_status":
      return applyPipelineTtsStatus(state, event);
    case "pipeline_judge_status":
      return applyPipelineJudgeStatus(state, event);
    case "showcase_tts_ready":
      return applyShowcaseTtsReady(state, event);
    default:
      return state;
  }
}

function stopMatch(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
): PartyRpgEngineState {
  const synced = syncPlayerRowsOnly(state, players);

  return {
    ...synced,
    assetJobStarted: false,
    enrichmentResolved: false,
    enrichmentStarted: false,
    judgeResolved: false,
    judgeStarted: false,
    publicState: {
      ...synced.publicState,
      judgePipelineStatus: "idle",
      latestMessage: "Party-RPG vom Host gestoppt.",
      llmMessage: null,
      narrationStatusByPlayerId: {},
      secondsRemaining: 0,
      stage:
        synced.publicState.stage === "lobby" ? "lobby" : "match_result",
      ttsStatusByPlayerId: {},
    },
  };
}

function startMatch(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  seed: number,
  _context: PartyRpgReducerContext,
): PartyRpgEngineState {
  void state;

  return {
    assetJobStarted: false,
    characterDraftByPlayer: {},
    enrichmentResolved: false,
    enrichmentStarted: false,
    judgeResolved: false,
    judgeStarted: false,
    llmEpoch: 0,
    privateAnswers: {},
    publicState: {
      answerDeadlineMs: null,
      characters: [],
      currentSituation: null,
      judgeWinnerId: null,
      latestMessage:
        "Erstellt eure Charaktere auf dem Handy. Zeitlimit laeuft.",
      llmMessage: null,
      matchComplete: false,
      playerRows: buildPlayerRows(players, { answers: false, ready: false }),
      roundCount: PARTY_ROUND_COUNT,
      roundIndex: 0,
      roundWinnerId: null,
      secondsRemaining: PARTY_SECONDS_CHARACTER_PHASE,
      sessionSeed: seed,
      showcaseEntries: [],
      showcaseIndex: 0,
      showcaseOrder: [],
      stage: "character_creation",
      judgePipelineStatus: "idle",
      narrationStatusByPlayerId: {},
      ttsStatusByPlayerId: {},
    },
    usedSituationIds: [],
  };
}

function syncPlayers(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  const synced = syncPlayerRowsOnly(state, players);

  if (shouldAutoAdvanceFromCharacterCreation(synced, players, context)) {
    return transitionToAssetGeneration(synced, players, context);
  }

  if (
    synced.publicState.stage === "answer_collection" &&
    allPlayerRowsSubmitted(synced)
  ) {
    return {
      ...synced,
      publicState: {
        ...synced.publicState,
        answerDeadlineMs: null,
        latestMessage: "Alle Antworten sind da. AI bereitet die Show vor...",
        llmMessage: "Barden-Modus: Texte werden veredelt.",
        secondsRemaining: PARTY_SECONDS_ASSET_FALLBACK,
        stage: "llm_enrichment",
      },
    };
  }

  return synced;
}

function syncPlayerRowsOnly(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
): PartyRpgEngineState {
  const previousRows = new Map(
    state.publicState.playerRows.map((row) => [row.playerId, row] as const),
  );

  const nextRows = players
    .filter((player) => isPartyRpgParticipantRole(player.role))
    .map((player) => {
      const prev = previousRows.get(player.playerId);
      return {
        characterReady: prev?.characterReady ?? false,
        playerId: player.playerId,
        submittedAnswer: prev?.submittedAnswer ?? false,
      } satisfies PartyRpgPlayerRow;
    });

  const prevCharacters = new Map(
    state.publicState.characters.map((character) => [
      character.playerId,
      character,
    ] as const),
  );

  const nextCharacters = nextRows.map((row) => {
    const existing = prevCharacters.get(row.playerId);
    if (existing !== undefined) {
      return existing;
    }
    return {
      archetype: null,
      assetStatus: "pending" as const,
      displayName: "",
      playerId: row.playerId,
      portraitEmoji: "🎭",
      slogan: "",
      summaryShort: "",
      voiceProfileId: PLAYER_VOICE_A,
    } satisfies PartyRpgCharacterPublic;
  });

  return {
    ...state,
    publicState: {
      ...state.publicState,
      characters: nextCharacters,
      playerRows: nextRows,
    },
  };
}

function buildPlayerRows(
  players: GamePlayerSnapshot[],
  defaults: { answers: boolean; ready: boolean },
): PartyRpgPlayerRow[] {
  return players
    .filter((player) => isPartyRpgParticipantRole(player.role))
    .map((player) => ({
      characterReady: defaults.ready,
      playerId: player.playerId,
      submittedAnswer: defaults.answers,
    }));
}

function registerCharacterDraft(
  state: PartyRpgEngineState,
  event: Extract<PartyRpgEvent, { type: "character_submitted" }>,
  _context: PartyRpgReducerContext,
): PartyRpgEngineState {
  if (state.publicState.stage !== "character_creation") {
    return syncPlayerRowsOnly(state, event.players);
  }

  const synced = syncPlayerRowsOnly(state, event.players);
  const row = synced.publicState.playerRows.find(
    (entry) => entry.playerId === event.playerId,
  );

  if (row === undefined || row.characterReady) {
    return synced;
  }

  const nextDrafts = {
    ...synced.characterDraftByPlayer,
    [event.playerId]: event.draft,
  };

  const nextCharacters = synced.publicState.characters.map((character) =>
    character.playerId === event.playerId
      ? {
          ...character,
          archetype: buildPublicArchetypeLabel(event.draft),
          displayName: event.draft.chosenName.trim(),
          portraitEmoji: pickPortraitEmoji(event.draft),
          slogan: event.draft.chosenSlogan.trim(),
          summaryShort: "",
          voiceProfileId: normalizePlayerVoiceProfileId(event.draft.voiceProfileId),
        }
      : character,
  );

  const next: PartyRpgEngineState = {
    ...synced,
    characterDraftByPlayer: nextDrafts,
    publicState: {
      ...synced.publicState,
      characters: nextCharacters,
      latestMessage:
        "Profil aktualisiert. Tippe auf Bereit, wenn du fertig bist.",
    },
  };

  return next;
}

function buildPublicArchetypeLabel(draft: PartyRpgCharacterDraft): string | null {
  const race = contentOptionById(CHARACTER_CREATION_CONTENT.races, draft.raceId);
  const cls = contentOptionById(CHARACTER_CREATION_CONTENT.classes, draft.classId);
  if (race === undefined || cls === undefined) {
    return null;
  }
  return `${race.label} · ${cls.label}`;
}

function pickPortraitEmoji(draft: PartyRpgCharacterDraft): string {
  const classId = draft.classId?.toLowerCase() ?? "";
  const raceId = draft.raceId?.toLowerCase() ?? "";

  const byClass: Record<string, string> = {
    barbarian: "🪓",
    bard: "🎻",
    cleric: "✨",
    druid: "🌿",
    fighter: "🛡️",
    paladin: "🕯️",
    ranger: "🏹",
    rogue: "🗡️",
    warlock: "🌀",
    wizard: "🪄",
  };
  const classEmoji = byClass[classId];
  if (classEmoji !== undefined) {
    return classEmoji;
  }

  const byRace: Record<string, string> = {
    aasimar: "😇",
    dragonborn: "🐉",
    dwarf: "🪨",
    elf: "🌙",
    gnome: "🔧",
    goblin: "🧌",
    half_orc: "💪",
    halfling: "🍰",
    human: "🙂",
    tiefling: "😈",
  };
  const raceEmoji = byRace[raceId];
  if (raceEmoji !== undefined) {
    return raceEmoji;
  }

  return "🎭";
}

function markCharacterReady(
  state: PartyRpgEngineState,
  event: Extract<PartyRpgEvent, { type: "character_ready" }>,
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  if (state.publicState.stage !== "character_creation") {
    return syncPlayerRowsOnly(state, event.players);
  }

  const synced = syncPlayerRowsOnly(state, event.players);
  const draft = synced.characterDraftByPlayer[event.playerId];
  if (draft === undefined) {
    return {
      ...synced,
      publicState: {
        ...synced.publicState,
        latestMessage: "Bitte zuerst ein Profil speichern.",
      },
    };
  }

  const validationError = validateDraft(draft);
  if (validationError !== null) {
    return {
      ...synced,
      publicState: {
        ...synced.publicState,
        latestMessage: validationError,
      },
    };
  }

  const nextRows = synced.publicState.playerRows.map((row) =>
    row.playerId === event.playerId
      ? { ...row, characterReady: true }
      : row,
  );

  const next: PartyRpgEngineState = {
    ...synced,
    publicState: {
      ...synced.publicState,
        latestMessage: `${draft.chosenName.trim()} ist bereit.`,
      playerRows: nextRows,
    },
  };

  if (shouldAutoAdvanceFromCharacterCreation(next, event.players, context)) {
    return transitionToAssetGeneration(next, event.players, context);
  }

  return next;
}

function shouldAutoAdvanceFromCharacterCreation(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): boolean {
  if (state.publicState.stage !== "character_creation") {
    return false;
  }

  const eligible = listEligiblePlayers(players);
  if (eligible.length === 0) {
    return false;
  }

  const allReady = eligible.every((player) => {
    const row = state.publicState.playerRows.find(
      (entry) => entry.playerId === player.playerId,
    );
    return row?.characterReady === true;
  });

  const deadlineMs =
    context.nowMs - (PARTY_SECONDS_CHARACTER_PHASE - state.publicState.secondsRemaining) * 1000;
  void deadlineMs;

  if (allReady) {
    return true;
  }

  return state.publicState.secondsRemaining <= 0;
}

function transitionToAssetGeneration(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  void context;

  const synced = syncPlayerRowsOnly(state, players);

  return {
    ...synced,
    assetJobStarted: false,
    publicState: {
      ...synced.publicState,
      latestMessage: "AI erstellt Charakterzusammenfassungen...",
      llmMessage: "Asset-Phase: Zusammenfassungen werden generiert.",
      secondsRemaining: PARTY_SECONDS_ASSET_FALLBACK,
      stage: "asset_generation",
    },
  };
}

function forceLeaveAssetGeneration(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  void context;
  const synced = syncPlayerRowsOnly(state, players);
  const withDefaults = applyTemplateSummaries(synced, players);
  return beginRoundIntro(withDefaults, players, context);
}

function applyAssetsReady(
  state: PartyRpgEngineState,
  event: Extract<PartyRpgEvent, { type: "assets_ready" }>,
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  void context;
  const synced = syncPlayerRowsOnly(state, event.players);
  const byId = new Map(
    event.characters.map((character) => [character.playerId, character] as const),
  );

  const nextCharacters = synced.publicState.characters.map((character) => {
    const updated = byId.get(character.playerId);
    return updated ?? character;
  });

  const next: PartyRpgEngineState = {
    ...synced,
    assetJobStarted: true,
    publicState: {
      ...synced.publicState,
      characters: nextCharacters,
    },
  };

  return beginRoundIntro(next, event.players, context);
}

function applyTemplateSummaries(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
): PartyRpgEngineState {
  const synced = syncPlayerRowsOnly(state, players);
  const nextCharacters = synced.publicState.characters.map((character) => {
    const draft = synced.characterDraftByPlayer[character.playerId];
    if (draft === undefined) {
      return {
        ...character,
        assetStatus: "error" as const,
        summaryShort: "Ein mysterioeser Wanderer ohne Hintergrundgeschichte.",
      };
    }

    if (character.summaryShort.trim() !== "" && character.assetStatus === "ready") {
      return character;
    }

    return {
      ...character,
      assetStatus: "ready" as const,
      summaryShort: buildFallbackSummary(draft),
    };
  });

  return {
    ...synced,
    publicState: {
      ...synced.publicState,
      characters: nextCharacters,
    },
  };
}

function buildFallbackSummary(draft: PartyRpgCharacterDraft): string {
  const preview = buildCharacterSummaryPreview(draft);
  if (preview.trim() !== "") {
    return preview.slice(0, 240);
  }
  const name = draft.chosenName.trim();
  const slogan = draft.chosenSlogan.trim();
  return `${name}: „${slogan}”`.slice(0, 240);
}

function beginRoundIntro(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  const synced = syncPlayerRowsOnly(state, players);
  const situation = pickSituation(synced, context);

  const clearedRows = synced.publicState.playerRows.map((row) => ({
    ...row,
    submittedAnswer: false,
  }));

  const nextRoundIndex =
    synced.publicState.stage === "asset_generation" ||
    synced.publicState.stage === "lobby"
      ? 1
      : synced.publicState.roundIndex + 1;

  return {
    ...synced,
    enrichmentResolved: false,
    enrichmentStarted: false,
    judgeResolved: false,
    judgeStarted: false,
    privateAnswers: {},
    publicState: {
      ...synced.publicState,
      answerDeadlineMs: null,
      currentSituation: {
        id: situation.id,
        prompt: situation.prompt,
        tags: situation.tags,
        title: situation.title,
      },
      judgeWinnerId: null,
      latestMessage: situation.title,
      llmMessage: null,
      roundIndex: nextRoundIndex,
      roundWinnerId: null,
      secondsRemaining: PARTY_SECONDS_ROUND_INTRO,
      showcaseEntries: [],
      showcaseIndex: 0,
      showcaseOrder: [],
      stage: "round_intro",
      playerRows: clearedRows,
      narrationStatusByPlayerId: {},
      ttsStatusByPlayerId: {},
      judgePipelineStatus: "idle",
    },
    usedSituationIds: [...synced.usedSituationIds, situation.id],
  };
}

function pickSituation(
  state: PartyRpgEngineState,
  context: PartyRpgReducerContext,
): PartyRpgSituation {
  const available = context.situations.filter(
    (situation) => !state.usedSituationIds.includes(situation.id),
  );
  const pool = available.length > 0 ? available : context.situations;
  const seed = state.publicState.sessionSeed + state.publicState.roundIndex * 997;
  const index = Math.abs(seed) % pool.length;
  const picked = pool[index];
  if (picked === undefined) {
    throw new Error("party_rpg_missing_situation");
  }
  return picked;
}

function skipIntro(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  if (state.publicState.stage !== "round_intro") {
    return syncPlayerRowsOnly(state, players);
  }
  const synced = syncPlayerRowsOnly(state, players);
  return {
    ...synced,
    publicState: {
      ...synced.publicState,
      answerDeadlineMs: context.nowMs + PARTY_SECONDS_ANSWER * 1000,
      latestMessage: "Antwortet jetzt privat auf dem Handy.",
      secondsRemaining: PARTY_SECONDS_ANSWER,
      stage: "answer_collection",
    },
  };
}

function registerAnswer(
  state: PartyRpgEngineState,
  event: Extract<PartyRpgEvent, { type: "answer_submitted" }>,
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  if (state.publicState.stage !== "answer_collection") {
    return syncPlayerRowsOnly(state, event.players);
  }

  const synced = syncPlayerRowsOnly(state, event.players);
  const deadline = synced.publicState.answerDeadlineMs;
  if (deadline !== null && context.nowMs > deadline) {
    return synced;
  }

  const row = synced.publicState.playerRows.find(
    (entry) => entry.playerId === event.playerId,
  );

  if (row === undefined || row.submittedAnswer) {
    return synced;
  }

  const normalized = normalizeAnswer(event.answerText);
  if (normalized === "") {
    return {
      ...synced,
      publicState: {
        ...synced.publicState,
        latestMessage: "Antwort zu kurz oder leer.",
      },
    };
  }

  const nextAnswers = {
    ...synced.privateAnswers,
    [event.playerId]: normalized,
  };

  const nextRows = synced.publicState.playerRows.map((rowEntry) =>
    rowEntry.playerId === event.playerId
      ? { ...rowEntry, submittedAnswer: true }
      : rowEntry,
  );

  const next: PartyRpgEngineState = {
    ...synced,
    privateAnswers: nextAnswers,
    publicState: {
      ...synced.publicState,
      latestMessage: "Antwort gespeichert.",
      playerRows: nextRows,
    },
  };

  if (allPlayerRowsSubmitted(next)) {
    return {
      ...next,
      publicState: {
        ...next.publicState,
        answerDeadlineMs: null,
        latestMessage: "Alle Antworten sind da. AI bereitet die Show vor...",
        llmMessage: "Barden-Modus: Texte werden veredelt.",
        secondsRemaining: PARTY_SECONDS_ASSET_FALLBACK,
        stage: "llm_enrichment",
      },
    };
  }

  return next;
}

/** Jede Spieler-Zeile in `playerRows` muss eine Antwort haben (unabhängig von `connected`). */
function allPlayerRowsSubmitted(state: PartyRpgEngineState): boolean {
  if (state.publicState.playerRows.length === 0) {
    return false;
  }
  return state.publicState.playerRows.every((row) => row.submittedAnswer);
}

function listEligiblePlayers(players: GamePlayerSnapshot[]): GamePlayerSnapshot[] {
  return players.filter(
    (player) => isPartyRpgParticipantRole(player.role) && player.connected === true,
  );
}

function advanceTimers(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  const synced = syncPlayerRowsOnly(state, players);
  const stage = synced.publicState.stage;
  const remaining = synced.publicState.secondsRemaining;

  if (stage === "lobby" || stage === "match_result") {
    return synced;
  }

  if (remaining <= 0) {
    return synced;
  }

  const nextSecs = remaining - 1;
  if (nextSecs > 0) {
    return {
      ...synced,
      publicState: {
        ...synced.publicState,
        secondsRemaining: nextSecs,
      },
    };
  }

  switch (stage) {
    case "character_creation":
      return transitionToAssetGeneration(synced, players, context);
    case "round_intro":
      return {
        ...synced,
        publicState: {
          ...synced.publicState,
          answerDeadlineMs: context.nowMs + PARTY_SECONDS_ANSWER * 1000,
          latestMessage: "Antwortet jetzt privat auf dem Handy.",
          secondsRemaining: PARTY_SECONDS_ANSWER,
          stage: "answer_collection",
        },
      };
    case "answer_collection":
      return fillMissingAnswersAndEnrich(synced, players, context);
    case "asset_generation":
      return forceLeaveAssetGeneration(synced, players, context);
    case "llm_enrichment":
      return applyEnrichmentTimeout(synced, players, context);
    case "showcase":
      return advanceShowcase(synced, players, context);
    case "judge_deliberation":
      return finalizeJudgeToRoundResult(synced, players, context);
    case "round_result":
      return synced;
    default:
      return synced;
  }
}

function fillMissingAnswersAndEnrich(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  void context;
  const synced = syncPlayerRowsOnly(state, players);
  let answers = { ...synced.privateAnswers };
  const nextRows = synced.publicState.playerRows.map((row) => {
    if (answers[row.playerId] !== undefined) {
      return row.submittedAnswer ? row : { ...row, submittedAnswer: true };
    }
    answers = {
      ...answers,
      [row.playerId]: "(Schweigt dramatisch und starrt in den Metarisse.)",
    };
    return { ...row, submittedAnswer: true };
  });

  return {
    ...synced,
    privateAnswers: answers,
    publicState: {
      ...synced.publicState,
      answerDeadlineMs: null,
      latestMessage: "Zeit abgelaufen – AI uebernimmt.",
      llmMessage: "Barden-Modus: Texte werden veredelt.",
      playerRows: nextRows,
      secondsRemaining: PARTY_SECONDS_ASSET_FALLBACK,
      stage: "llm_enrichment",
    },
  };
}

function advanceShowcase(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  if (state.publicState.stage !== "showcase") {
    return syncPlayerRowsOnly(state, players);
  }
  void context;
  const synced = syncPlayerRowsOnly(state, players);
  const nextIndex = synced.publicState.showcaseIndex + 1;

  if (nextIndex >= synced.publicState.showcaseOrder.length) {
    return {
      ...synced,
      judgeResolved: false,
      judgeStarted: false,
      publicState: {
        ...synced.publicState,
        latestMessage: "Der Judge trifft eine Entscheidung...",
        llmMessage: null,
        secondsRemaining: PARTY_SECONDS_JUDGE,
        showcaseIndex: nextIndex,
        stage: "judge_deliberation",
      },
    };
  }

  return {
    ...synced,
    publicState: {
      ...synced.publicState,
      latestMessage: `Naechster Auftritt (${String(nextIndex + 1)}/${String(synced.publicState.showcaseOrder.length)}).`,
      secondsRemaining: PARTY_SECONDS_SHOWCASE_STEP,
      showcaseIndex: nextIndex,
    },
  };
}

function finalizeJudgeToRoundResult(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  void context;
  const synced = syncPlayerRowsOnly(state, players);
  if (synced.judgeResolved) {
    return synced;
  }

  const winnerId = pickDeterministicWinner(synced, players);
  const withComments = synced.publicState.showcaseEntries.map((entry) =>
    entry.judgeComment === null
      ? {
          ...entry,
          judgeComment: "Solide. Aber nicht legendär.",
        }
      : entry,
  );

  return {
    ...synced,
    judgeResolved: true,
    judgeStarted: true,
    publicState: {
      ...synced.publicState,
      judgePipelineStatus: "completed",
      judgeWinnerId: winnerId,
      latestMessage: `Rundensieger (Fallback): ${winnerId}`,
      roundWinnerId: winnerId,
      secondsRemaining: PARTY_SECONDS_ROUND_RESULT,
      showcaseEntries: withComments,
      stage: "round_result",
    },
  };
}

function pickDeterministicWinner(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
): string {
  const eligible = listEligiblePlayers(players);
  if (eligible.length > 0) {
    const seed = state.publicState.sessionSeed + state.publicState.roundIndex;
    const pick = eligible[Math.abs(seed) % eligible.length];
    if (pick !== undefined) {
      return pick.playerId;
    }
  }
  const first = state.publicState.showcaseOrder[0];
  return first ?? "unknown";
}

function applyEnrichmentReady(
  state: PartyRpgEngineState,
  event: Extract<PartyRpgEvent, { type: "enrichment_ready" }>,
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  void context;
  const synced = syncPlayerRowsOnly(state, event.players);
  return {
    ...synced,
    enrichmentResolved: true,
    enrichmentStarted: true,
    llmEpoch: synced.llmEpoch + 1,
    publicState: {
      ...synced.publicState,
      answerDeadlineMs: null,
      judgeWinnerId: null,
      latestMessage: "Die Show beginnt!",
      llmMessage: null,
      secondsRemaining: PARTY_SECONDS_SHOWCASE_STEP,
      showcaseEntries: event.entries,
      showcaseIndex: 0,
      showcaseOrder: event.entries.map((entry) => entry.playerId),
      stage: "showcase",
    },
  };
}

function applyEnrichmentTimeout(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  if (state.publicState.stage !== "llm_enrichment") {
    return syncPlayerRowsOnly(state, players);
  }
  if (state.enrichmentResolved) {
    return syncPlayerRowsOnly(state, players);
  }

  return applyEnrichmentReady(
    state,
    {
      entries: buildFallbackShowcaseEntries(state, players),
      players,
      type: "enrichment_ready",
    },
    context,
  );
}

function buildFallbackShowcaseEntries(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
): PartyRpgShowcaseEntry[] {
  const byId = new Map(
    players.map((player) => [player.playerId, player] as const),
  );
  const ordered = [...state.publicState.playerRows]
    .slice()
    .sort((left, right) => left.playerId.localeCompare(right.playerId));

  return ordered.map((row) => {
    const player = byId.get(row.playerId);
    const displayName = player?.name ?? row.playerId;
    const answer = state.privateAnswers[row.playerId] ?? "(nichts gesagt)";
    const safe =
      answer.length > 160 ? `${answer.slice(0, 157).trimEnd()}…` : answer;
    const line = `${displayName} murmelt etwas Ungeheuerliches: „${safe}”`;
    return {
      audioCueText: null,
      judgeComment: null,
      narrationSegmentTexts: [line, "Hm.", line, "Weiter."],
      narrationText: line,
      playerId: row.playerId,
      ttsReady: false,
    };
  });
}

function applyPipelineNarrationStatus(
  state: PartyRpgEngineState,
  event: Extract<PartyRpgEvent, { type: "pipeline_narration_status" }>,
): PartyRpgEngineState {
  const synced = syncPlayerRowsOnly(state, event.players);
  return {
    ...synced,
    publicState: {
      ...synced.publicState,
      narrationStatusByPlayerId: {
        ...synced.publicState.narrationStatusByPlayerId,
        [event.playerId]: event.status,
      },
    },
  };
}

function applyPipelineTtsStatus(
  state: PartyRpgEngineState,
  event: Extract<PartyRpgEvent, { type: "pipeline_tts_status" }>,
): PartyRpgEngineState {
  const synced = syncPlayerRowsOnly(state, event.players);
  return {
    ...synced,
    publicState: {
      ...synced.publicState,
      ttsStatusByPlayerId: {
        ...synced.publicState.ttsStatusByPlayerId,
        [event.playerId]: event.status,
      },
    },
  };
}

function applyPipelineJudgeStatus(
  state: PartyRpgEngineState,
  event: Extract<PartyRpgEvent, { type: "pipeline_judge_status" }>,
): PartyRpgEngineState {
  const synced = syncPlayerRowsOnly(state, event.players);
  return {
    ...synced,
    publicState: {
      ...synced.publicState,
      judgePipelineStatus: event.status,
    },
  };
}

function applyShowcaseTtsReady(
  state: PartyRpgEngineState,
  event: Extract<PartyRpgEvent, { type: "showcase_tts_ready" }>,
): PartyRpgEngineState {
  const synced = syncPlayerRowsOnly(state, event.players);
  if (synced.publicState.stage !== "showcase") {
    return synced;
  }
  const entries = synced.publicState.showcaseEntries.map((entry) =>
    entry.playerId === event.playerId ? { ...entry, ttsReady: true } : entry,
  );
  return {
    ...synced,
    publicState: {
      ...synced.publicState,
      showcaseEntries: entries,
      ttsStatusByPlayerId: {
        ...synced.publicState.ttsStatusByPlayerId,
        [event.playerId]: "completed",
      },
    },
  };
}

function applyJudgeCompleted(
  state: PartyRpgEngineState,
  event: Extract<PartyRpgEvent, { type: "judge_completed" }>,
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  void context;
  if (state.publicState.stage !== "judge_deliberation") {
    return syncPlayerRowsOnly(state, event.players);
  }

  const synced = syncPlayerRowsOnly(state, event.players);
  const validIds = new Set(
    listEligiblePlayers(event.players).map((player) => player.playerId),
  );
  const winnerId = validIds.has(event.winnerId)
    ? event.winnerId
    : pickDeterministicWinner(synced, event.players);

  const entries = synced.publicState.showcaseEntries.map((entry) => {
    const comment = event.commentsByPlayerId[entry.playerId];
    return comment === undefined
      ? entry
      : { ...entry, judgeComment: comment };
  });

  return {
    ...synced,
    judgeResolved: true,
    judgeStarted: true,
    publicState: {
      ...synced.publicState,
      judgePipelineStatus: "completed",
      judgeWinnerId: winnerId,
      latestMessage: "Runde entschieden!",
      roundWinnerId: winnerId,
      secondsRemaining: PARTY_SECONDS_ROUND_RESULT,
      showcaseEntries: entries,
      stage: "round_result",
    },
  };
}

function continueRound(
  state: PartyRpgEngineState,
  players: GamePlayerSnapshot[],
  context: PartyRpgReducerContext,
): PartyRpgEngineState {
  if (state.publicState.stage !== "round_result") {
    return syncPlayerRowsOnly(state, players);
  }

  const synced = syncPlayerRowsOnly(state, players);
  if (synced.publicState.roundIndex >= synced.publicState.roundCount) {
    return {
      ...synced,
      publicState: {
        ...synced.publicState,
        latestMessage: "Match beendet!",
        llmMessage: null,
        matchComplete: true,
        secondsRemaining: 0,
        stage: "match_result",
      },
    };
  }

  return beginRoundIntro(synced, players, context);
}

function requireKnownId(
  list: ContentOption[],
  id: string | null,
  label: string,
): string | null {
  if (id === null || normalizeField(id) === "") {
    return `Bitte ${label} waehlen.`;
  }
  if (contentOptionById(list, id) === undefined) {
    return `Ungueltige Auswahl: ${label}.`;
  }
  return null;
}

export function validateDraft(draft: PartyRpgCharacterDraft): string | null {
  const chosenName = normalizeField(draft.chosenName);
  const chosenSlogan = normalizeField(draft.chosenSlogan);

  const idChecks: Array<string | null> = [
    requireKnownId(CHARACTER_CREATION_CONTENT.races, draft.raceId, "Rasse"),
    requireKnownId(CHARACTER_CREATION_CONTENT.classes, draft.classId, "Klasse"),
    requireKnownId(CHARACTER_CREATION_CONTENT.jobs, draft.jobId, "Beruf"),
    requireKnownId(
      CHARACTER_CREATION_CONTENT.backgrounds,
      draft.backgroundId,
      "Background",
    ),
    requireKnownId(CHARACTER_CREATION_CONTENT.flaws, draft.flawId, "Makel"),
    requireKnownId(CHARACTER_CREATION_CONTENT.quirks, draft.quirkId, "Eigenheit"),
    requireKnownId(
      CHARACTER_CREATION_CONTENT.signatureObjects,
      draft.signatureObjectId,
      "Signatur-Objekt",
    ),
    requireKnownId(
      CHARACTER_CREATION_CONTENT.startItems,
      draft.startItemId ?? null,
      "Startitem",
    ),
  ];

  for (const err of idChecks) {
    if (err !== null) {
      return err;
    }
  }

  if (chosenName.length < 2 || chosenName.length > 24) {
    return "Name muss zwischen 2 und 24 Zeichen haben.";
  }
  if (chosenSlogan.length < 6 || chosenSlogan.length > 60) {
    return "Slogan muss zwischen 6 und 60 Zeichen haben.";
  }

  const voice = draft.voiceProfileId?.trim();
  if (voice !== PLAYER_VOICE_A && voice !== PLAYER_VOICE_B) {
    return "Bitte eine Spielerstimme waehlen.";
  }

  return null;
}

function normalizeField(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeAnswer(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 3) {
    return "";
  }
  return normalized.slice(0, 280);
}

function readNullableId(record: Record<string, unknown>, key: string): string | null {
  const raw = record[key];
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseCharacterDraftPayload(
  value: unknown,
): PartyRpgCharacterDraft | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  const chosenName =
    typeof record.chosenName === "string"
      ? record.chosenName
      : typeof record.name === "string"
        ? record.name
        : "";
  const chosenSlogan =
    typeof record.chosenSlogan === "string"
      ? record.chosenSlogan
      : typeof record.slogan === "string"
        ? record.slogan
        : "";

  const draft: PartyRpgCharacterDraft = {
    backgroundId: readNullableId(record, "backgroundId"),
    chosenName,
    chosenSlogan,
    classId: readNullableId(record, "classId"),
    flawId: readNullableId(record, "flawId"),
    jobId: readNullableId(record, "jobId"),
    quirkId: readNullableId(record, "quirkId"),
    raceId: readNullableId(record, "raceId"),
    signatureObjectId: readNullableId(record, "signatureObjectId"),
    startItemId: readNullableId(record, "startItemId"),
    voiceProfileId: readNullableId(record, "voiceProfileId"),
  };

  return draft;
}
