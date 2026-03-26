import { CHARACTER_CREATION_CONTENT, contentOptionById } from "./character-content.js";
import type { CharacterProfileDraft } from "./character-models.js";
import { normalizePlayerVoiceProfileId, type PlayerVoiceProfileId } from "./voices.js";

export type CharacterStyleProfile = {
  attitudeTags: string[];
  comedicHooks: string[];
  likelyComplications: string[];
  personaSummary: string;
  signatureReferences: string[];
  slogan: string;
  speechStyle: string[];
  toneTags: string[];
  voiceProfileId: PlayerVoiceProfileId;
};

export function buildCharacterStyleProfile(draft: CharacterProfileDraft): CharacterStyleProfile {
  const race = contentOptionById(CHARACTER_CREATION_CONTENT.races, draft.raceId);
  const cls = contentOptionById(CHARACTER_CREATION_CONTENT.classes, draft.classId);
  const job = contentOptionById(CHARACTER_CREATION_CONTENT.jobs, draft.jobId);
  const bg = contentOptionById(CHARACTER_CREATION_CONTENT.backgrounds, draft.backgroundId);
  const flaw = contentOptionById(CHARACTER_CREATION_CONTENT.flaws, draft.flawId);
  const quirk = contentOptionById(CHARACTER_CREATION_CONTENT.quirks, draft.quirkId);
  const sig = contentOptionById(
    CHARACTER_CREATION_CONTENT.signatureObjects,
    draft.signatureObjectId,
  );
  const startItem = contentOptionById(
    CHARACTER_CREATION_CONTENT.startItems,
    draft.startItemId ?? null,
  );

  const toneTags: string[] = [];
  const attitudeTags: string[] = [];

  if (quirk !== undefined) {
    toneTags.push(...quirk.tags.slice(0, 3));
    attitudeTags.push(quirk.label);
  }
  if (flaw !== undefined) {
    toneTags.push(...flaw.tags.slice(0, 2));
    attitudeTags.push(flaw.label);
  }
  if (bg !== undefined) {
    toneTags.push(...bg.tags.slice(0, 2));
  }

  const speechStyle: string[] = [];
  if (cls !== undefined) {
    speechStyle.push(`${cls.label}-Energy`);
  }
  if (job !== undefined) {
    speechStyle.push(`${job.label}-Jargon`);
  }

  const comedicHooks: string[] = [];
  if (flaw !== undefined) {
    comedicHooks.push(`${flaw.label}: ${flaw.description}`);
  }
  if (quirk !== undefined) {
    comedicHooks.push(`${quirk.label}: ${quirk.description}`);
  }
  if (startItem !== undefined) {
    comedicHooks.push(`Startequipment: ${startItem.label}`);
  }

  const likelyComplications: string[] = [];
  if (flaw !== undefined) {
    likelyComplications.push(flaw.description.slice(0, 120));
  }
  if (job !== undefined) {
    likelyComplications.push(`${job.label} bringt neue Probleme.`);
  }

  const signatureReferences: string[] = [];
  if (sig !== undefined) {
    signatureReferences.push(`${sig.label} — ${sig.description.slice(0, 100)}`);
  }
  if (startItem !== undefined) {
    signatureReferences.push(startItem.label);
  }

  const parts: string[] = [];
  if (race !== undefined && cls !== undefined) {
    parts.push(`${race.label} ${cls.label}`);
  }
  if (job !== undefined && bg !== undefined) {
    parts.push(`${job.label}, früher: ${bg.label}`);
  }

  return {
    attitudeTags: attitudeTags.slice(0, 6),
    comedicHooks: comedicHooks.slice(0, 4),
    likelyComplications: likelyComplications.slice(0, 3),
    personaSummary: parts.join("; ").slice(0, 220),
    signatureReferences: signatureReferences.slice(0, 4),
    slogan: draft.chosenSlogan.trim().slice(0, 80),
    speechStyle: speechStyle.slice(0, 4),
    toneTags: [...new Set(toneTags)].slice(0, 8),
    voiceProfileId: normalizePlayerVoiceProfileId(draft.voiceProfileId),
  };
}
