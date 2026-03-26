import { CHARACTER_CREATION_CONTENT, contentOptionById } from "./character-content.js";
import type { CharacterProfileDraft } from "./character-models.js";
import { PLAYER_VOICE_A, PLAYER_VOICE_B } from "./voices.js";

export const WIZARD_STEP_COUNT = 5;
export const WIZARD_STORAGE_VERSION = 1;

export type PersistedWizardState = {
  draft: CharacterProfileDraft;
  step: number;
  v: typeof WIZARD_STORAGE_VERSION;
};

export function missingWitzmacherLabels(draft: CharacterProfileDraft): string[] {
  const labels: string[] = [];
  if (draft.flawId === null) {
    labels.push("Makel");
  }
  if (draft.quirkId === null) {
    labels.push("Quirk");
  }
  if (draft.signatureObjectId === null) {
    labels.push("Signatur-Objekt");
  }
  if (draft.startItemId === null) {
    labels.push("Startequipment");
  }
  return labels;
}

function idKnownIn(
  list: typeof CHARACTER_CREATION_CONTENT.races,
  id: string | null,
): boolean {
  if (id === null) {
    return true;
  }
  return contentOptionById(list, id) !== undefined;
}

/** Strikte Prüfung für Wiederherstellung aus sessionStorage (nur bekannte Content-IDs). */
export function sanitizePersistedWizard(blob: unknown): PersistedWizardState | null {
  if (typeof blob !== "object" || blob === null) {
    return null;
  }
  const record = blob as Record<string, unknown>;
  if (record.v !== WIZARD_STORAGE_VERSION) {
    return null;
  }
  const stepRaw = record.step;
  if (typeof stepRaw !== "number" || !Number.isInteger(stepRaw)) {
    return null;
  }
  if (stepRaw < 0 || stepRaw >= WIZARD_STEP_COUNT) {
    return null;
  }
  const draftRaw = record.draft;
  if (typeof draftRaw !== "object" || draftRaw === null) {
    return null;
  }
  const d = draftRaw as Record<string, unknown>;

  const raceId = typeof d.raceId === "string" ? d.raceId : null;
  const classId = typeof d.classId === "string" ? d.classId : null;
  const jobId = typeof d.jobId === "string" ? d.jobId : null;
  const backgroundId = typeof d.backgroundId === "string" ? d.backgroundId : null;
  const flawId = typeof d.flawId === "string" ? d.flawId : null;
  const quirkId = typeof d.quirkId === "string" ? d.quirkId : null;
  const signatureObjectId =
    typeof d.signatureObjectId === "string" ? d.signatureObjectId : null;
  const startItemId = typeof d.startItemId === "string" ? d.startItemId : null;
  const chosenName = typeof d.chosenName === "string" ? d.chosenName : "";
  const chosenSlogan = typeof d.chosenSlogan === "string" ? d.chosenSlogan : "";
  const voiceProfileId =
    typeof d.voiceProfileId === "string" ? d.voiceProfileId.trim() : null;
  if (
    voiceProfileId !== null &&
    voiceProfileId !== PLAYER_VOICE_A &&
    voiceProfileId !== PLAYER_VOICE_B
  ) {
    return null;
  }

  const draft: CharacterProfileDraft = {
    backgroundId,
    chosenName,
    chosenSlogan,
    classId,
    flawId,
    jobId,
    quirkId,
    raceId,
    signatureObjectId,
    startItemId,
    voiceProfileId,
  };

  const c = CHARACTER_CREATION_CONTENT;
  if (
    !idKnownIn(c.races, draft.raceId) ||
    !idKnownIn(c.classes, draft.classId) ||
    !idKnownIn(c.jobs, draft.jobId) ||
    !idKnownIn(c.backgrounds, draft.backgroundId) ||
    !idKnownIn(c.flaws, draft.flawId) ||
    !idKnownIn(c.quirks, draft.quirkId) ||
    !idKnownIn(c.signatureObjects, draft.signatureObjectId) ||
    !idKnownIn(c.startItems, draft.startItemId)
  ) {
    return null;
  }

  return { draft, step: stepRaw, v: WIZARD_STORAGE_VERSION };
}

export function wizardStorageKey(playerId: string): string {
  return `party-rpg-char-wizard:${playerId}`;
}
