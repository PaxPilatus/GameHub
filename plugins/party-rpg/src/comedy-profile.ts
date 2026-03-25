/**
 * Maps normierte Content-Tags to comedy axes (stylistic identity only).
 * Values are additive contributions; final profile is normalized for display.
 */

import { CHARACTER_CREATION_CONTENT, contentOptionById } from "./character-content.js";
import type {
  CharacterProfileDraft,
  ComedyAxisKey,
  ComedyProfile,
} from "./character-models.js";
import { COMEDY_AXIS_KEYS } from "./character-models.js";

type AxisWeights = Partial<Record<ComedyAxisKey, number>>;

/** Per-tag stylistic leanings (0..1-ish contributions per axis). */
const TAG_AXIS_WEIGHTS: Record<string, AxisWeights> = {
  ambitious: { competence: 0.35, ego: 0.45, drama: 0.25 },
  arcane: { style: 0.5, competence: 0.4, drama: 0.2 },
  awkward: { bad_luck: 0.55, chaos: 0.25, drama: 0.2 },
  bureaucratic: { competence: 0.45, ego: 0.15, style: 0.2 },
  charming: { ego: 0.25, style: 0.35, drama: 0.15 },
  chaotic: { chaos: 0.75, drama: 0.35, bad_luck: 0.2 },
  /** Nicht „Item-Power“, sondern komödiantischer Mangel-Charme. */
  defective: { bad_luck: 0.5, chaos: 0.2, drama: 0.15 },
  crafty: { competence: 0.5, style: 0.2 },
  cunning: { competence: 0.55, ego: 0.25 },
  curious: { competence: 0.35, chaos: 0.2, style: 0.15 },
  disciplined: { competence: 0.65, chaos: -0.15, drama: 0.1 },
  dramatic: { drama: 0.7, ego: 0.25 },
  earnest: { competence: 0.35, drama: 0.3, bad_luck: 0.15 },
  elegant: { style: 0.65, ego: 0.25 },
  eerie: { style: 0.4, bad_luck: 0.35, drama: 0.25 },
  feral: { chaos: 0.55, style: 0.2, drama: 0.2 },
  formal: { style: 0.45, ego: 0.2, competence: 0.25 },
  glamorous: { style: 0.7, ego: 0.35, drama: 0.2 },
  grimy: { bad_luck: 0.35, style: 0.15, chaos: 0.2 },
  heroic: { drama: 0.45, ego: 0.3, competence: 0.25 },
  holy: { drama: 0.4, style: 0.3, competence: 0.3 },
  mystical: { style: 0.45, drama: 0.35, competence: 0.2 },
  noble: { ego: 0.45, style: 0.4, drama: 0.25 },
  playful: { chaos: 0.45, style: 0.25, bad_luck: 0.15 },
  rebellious: { chaos: 0.45, ego: 0.35, drama: 0.25 },
  radiant: { style: 0.55, drama: 0.25 },
  rugged: { competence: 0.35, bad_luck: 0.2, style: 0.15 },
  rustic: { style: 0.2, bad_luck: 0.15, drama: 0.15 },
  scholarly: { competence: 0.55, style: 0.25, ego: 0.1 },
  scrappy: { bad_luck: 0.4, chaos: 0.35, competence: 0.2 },
  smug: { ego: 0.65, drama: 0.2, style: 0.15 },
  stoic: { competence: 0.45, drama: 0.15, chaos: -0.1 },
  streetwise: { competence: 0.4, chaos: 0.15, bad_luck: 0.2 },
  theatrical: { drama: 0.7, style: 0.45, ego: 0.25 },
  whimsical: { chaos: 0.35, style: 0.35, bad_luck: 0.2 },
  worldly: { competence: 0.4, drama: 0.2, style: 0.15 },
};

function accumulateAxis(weights: AxisWeights, target: ComedyProfile, scale: number): void {
  for (const key of COMEDY_AXIS_KEYS) {
    const delta = weights[key];
    if (delta !== undefined) {
      target[key] += delta * scale;
    }
  }
}

function tagsFromDraft(draft: CharacterProfileDraft): string[] {
  const { backgrounds, classes, flaws, jobs, quirks, races, signatureObjects, startItems } =
    CHARACTER_CREATION_CONTENT;

  const options = [
    contentOptionById(races, draft.raceId),
    contentOptionById(classes, draft.classId),
    contentOptionById(jobs, draft.jobId),
    contentOptionById(backgrounds, draft.backgroundId),
    contentOptionById(flaws, draft.flawId),
    contentOptionById(quirks, draft.quirkId),
    contentOptionById(signatureObjects, draft.signatureObjectId),
    contentOptionById(startItems, draft.startItemId ?? null),
  ];

  const tagSet = new Set<string>();
  for (const option of options) {
    if (option === undefined) {
      continue;
    }
    for (const tag of option.tags) {
      tagSet.add(tag);
    }
  }
  return [...tagSet];
}

/**
 * Raw aggregated comedy vector (may include negative contributions from e.g. disciplined vs chaos).
 */
export function computeComedyProfileRaw(draft: CharacterProfileDraft): ComedyProfile {
  const raw: ComedyProfile = {
    bad_luck: 0,
    chaos: 0,
    competence: 0,
    drama: 0,
    ego: 0,
    style: 0,
  };

  const tags = tagsFromDraft(draft);
  for (const tag of tags) {
    const weights = TAG_AXIS_WEIGHTS[tag];
    if (weights !== undefined) {
      accumulateAxis(weights, raw, 1);
    }
  }

  if (tags.length === 0) {
    for (const key of COMEDY_AXIS_KEYS) {
      raw[key] = 0.35;
    }
    return raw;
  }

  return raw;
}

/** Normalize to 0..1 for radar polygon (min-max over axes). */
export function normalizeComedyProfileForDisplay(raw: ComedyProfile): ComedyProfile {
  const values = COMEDY_AXIS_KEYS.map((key) => raw[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const out: ComedyProfile = { ...raw };
  if (span < 1e-6) {
    for (const key of COMEDY_AXIS_KEYS) {
      out[key] = 0.55;
    }
    return out;
  }
  for (const key of COMEDY_AXIS_KEYS) {
    const value = raw[key];
    out[key] = Math.max(0, Math.min(1, (value - min) / span));
  }
  return out;
}

export function computeComedyProfileForDisplay(draft: CharacterProfileDraft): ComedyProfile {
  return normalizeComedyProfileForDisplay(computeComedyProfileRaw(draft));
}
