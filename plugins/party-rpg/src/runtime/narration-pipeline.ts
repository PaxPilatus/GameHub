import type { NarrationScript } from "@game-hub/ai-gateway";
import type { MechanicsResolution } from "../mechanics.js";
import type { CharacterStyleProfile } from "../style-profile.js";
import type { PartyRpgShowcaseEntry } from "../reducer.js";
import { JUDGE_VOICE_DEFAULT } from "../voices.js";

export function mechanicsToJson(input: {
  mechanics: MechanicsResolution;
  playerId: string;
  roundIndex: number;
  sessionId: string;
}): string {
  return JSON.stringify({
    outcome: input.mechanics.outcome,
    playerId: input.playerId,
    rollSummary: input.mechanics.rollSummary,
    roundIndex: input.roundIndex,
    sessionId: input.sessionId,
    total: input.mechanics.total,
    baseDC: input.mechanics.baseDC,
    d20: input.mechanics.d20,
  } satisfies Record<string, unknown>);
}

export function styleProfileToJson(style: CharacterStyleProfile): string {
  return JSON.stringify(style satisfies Record<string, unknown>);
}

export function roundContextToJson(input: {
  situationPrompt: string;
  situationTitle: string;
  situationId: string;
  situationTags: string[];
}): string {
  return JSON.stringify({
    situationId: input.situationId,
    situationPrompt: input.situationPrompt,
    situationTags: input.situationTags,
    situationTitle: input.situationTitle,
  } satisfies Record<string, unknown>);
}

/** Deterministic short lines when LLM fails; respects speaker order. */
export function buildFallbackNarrationScript(input: {
  answerText: string;
  mechanics: MechanicsResolution;
  playerId: string;
  playerName: string;
  roundIndex: number;
  sessionId: string;
}): NarrationScript {
  const trimmed =
    input.answerText.length > 120
      ? `${input.answerText.slice(0, 117).trimEnd()}…`
      : input.answerText;

  const s1 = `${input.playerName} handelt: ${trimmed}`.slice(0, 180);
  const s2 = `Schiedsrichter: ${input.mechanics.rollSummary}`.slice(0, 180);
  const s3 = `${input.playerName} spuert die Konsequenzen.`.slice(0, 180);
  const outLabel = input.mechanics.outcome.replaceAll("_", " ");
  const s4 = `Schiedsrichter: Ergebnis — ${outLabel}.`.slice(0, 180);

  return {
    outcome: input.mechanics.outcome,
    playerId: input.playerId,
    rollSummary: input.mechanics.rollSummary,
    roundIndex: input.roundIndex,
    segments: [
      { index: 1, speaker: "player", text: s1 },
      { index: 2, speaker: "judge", text: s2 },
      { index: 3, speaker: "player", text: s3 },
      { index: 4, speaker: "judge", text: s4 },
    ],
    sessionId: input.sessionId,
  };
}

export function showcaseEntryFromNarrationScript(
  script: NarrationScript,
  ttsReady: boolean,
): PartyRpgShowcaseEntry {
  const texts = script.segments.map((s) => s.text);
  return {
    audioCueText: texts[0] !== undefined ? texts[0].slice(0, 120) : null,
    judgeComment: null,
    narrationSegmentTexts: texts,
    narrationText: texts.join(" "),
    playerId: script.playerId,
    ttsReady,
  };
}

export function resolveVoiceForSegment(input: {
  segmentSpeaker: "player" | "judge";
  playerVoiceProfileId: string;
}): string {
  if (input.segmentSpeaker === "judge") {
    return JUDGE_VOICE_DEFAULT;
  }
  return input.playerVoiceProfileId;
}
