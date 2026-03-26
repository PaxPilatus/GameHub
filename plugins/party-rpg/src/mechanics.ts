/**
 * Deterministic “roll” resolution for Party-RPG rounds (authoritative on host).
 * Uses only sessionSeed, roundIndex, playerId, and normalized answer text — no LLM.
 */

import type { CharacterProfileDraft } from "./character-models.js";
import { buildCharacterStyleProfile } from "./style-profile.js";

export type RollOutcome =
  | "critical_success"
  | "success"
  | "mixed"
  | "fail"
  | "critical_fail";

export interface MechanicsResolution {
  baseDC: number;
  tagBonus: number;
  flawPenalty: number;
  hookBonus: number;
  riskModifier: number;
  d20: number;
  total: number;
  outcome: RollOutcome;
  rollSummary: string;
}

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0;i < input.length;i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickD20(seed: number, roundIndex: number, playerId: string, answer: string): number {
  const h = hash32(`${String(seed)}:${String(roundIndex)}:${playerId}:${answer}`);
  return (h % 20) + 1;
}

function outcomeFromDelta(delta: number, d20: number): RollOutcome {
  if (d20 === 20) {
    return "critical_success";
  }
  if (d20 === 1) {
    return "critical_fail";
  }
  if (delta >= 4) {
    return "success";
  }
  if (delta >= 0) {
    return "mixed";
  }
  return "fail";
}

export function computeMechanicsResolution(input: {
  answerText: string;
  draft: CharacterProfileDraft;
  playerId: string;
  roundIndex: number;
  sessionSeed: number;
  situationTags: string[];
}): MechanicsResolution {
  const style = buildCharacterStyleProfile(input.draft);
  const baseDC = 12 + (Math.abs(hash32(input.roundIndex.toString())) % 3);

  const tagBonus = Math.min(
    4,
    input.situationTags.filter((tag) =>
      style.toneTags.some((tone) => tone.toLowerCase() === tag.toLowerCase()),
    ).length * 2,
  );

  const flawPenalty =
    style.likelyComplications.length > 0
      ? 2 + (Math.abs(hash32(style.likelyComplications[0] ?? "")) % 2)
      : 1;

  const hookBonus = Math.min(3, style.comedicHooks.length);

  const riskRaw = hash32(`${input.answerText}:${input.playerId}`);
  const riskModifier = (riskRaw % 5) - 2;

  const d20 = pickD20(input.sessionSeed, input.roundIndex, input.playerId, input.answerText);

  const total =
    d20 + tagBonus + hookBonus + riskModifier - flawPenalty;

  const delta = total - baseDC;
  const outcome = outcomeFromDelta(delta, d20);

  const rollSummary = `Wurf ${String(d20)} vs DC ${String(baseDC)} (${outcome.replaceAll("_", " ")})`;

  return {
    baseDC,
    d20,
    flawPenalty,
    hookBonus,
    outcome,
    riskModifier,
    rollSummary,
    tagBonus,
    total,
  };
}

/** If character draft is missing (e.g. resync edge), still produce a deterministic resolution. */
export function computeFallbackMechanicsResolution(input: {
  answerText: string;
  playerId: string;
  roundIndex: number;
  sessionSeed: number;
}): MechanicsResolution {
  const d20 = pickD20(input.sessionSeed, input.roundIndex, input.playerId, input.answerText);
  const baseDC = 12;
  const total = d20;
  const delta = total - baseDC;
  const outcome = outcomeFromDelta(delta, d20);
  const rollSummary = `Wurf ${String(d20)} vs DC ${String(baseDC)} (${outcome.replaceAll("_", " ")})`;
  return {
    baseDC,
    d20,
    flawPenalty: 0,
    hookBonus: 0,
    outcome,
    riskModifier: 0,
    rollSummary,
    tagBonus: 0,
    total,
  };
}
