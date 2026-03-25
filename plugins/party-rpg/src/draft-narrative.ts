import { CHARACTER_CREATION_CONTENT, contentOptionById } from "./character-content.js";
import type { CharacterProfileDraft } from "./character-models.js";

/** Optionale Felder passend zur AiGateway `generateCharacterSummary`-Schnittstelle. */
export function buildAiCharacterSummaryExtras(
  draft: CharacterProfileDraft,
): {
  archetype?: string;
  funFact?: string;
  motto?: string;
  weakness?: string;
} {
  const race = contentOptionById(CHARACTER_CREATION_CONTENT.races, draft.raceId);
  const cls = contentOptionById(CHARACTER_CREATION_CONTENT.classes, draft.classId);
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

  const out: {
    archetype?: string;
    funFact?: string;
    motto?: string;
    weakness?: string;
  } = {};

  if (race !== undefined && cls !== undefined) {
    out.archetype = `${race.label} · ${cls.label}`;
  }
  if (quirk !== undefined) {
    let funFact = `${quirk.label}: ${quirk.description}`;
    if (startItem !== undefined) {
      funFact += ` Startequipment: ${startItem.label} — ${startItem.description}`;
    }
    out.funFact = funFact;
  }
  if (sig !== undefined) {
    out.motto = `${sig.label}: ${sig.description}`;
  }
  if (flaw !== undefined) {
    out.weakness = `${flaw.label}: ${flaw.description}`;
  }

  return out;
}

/** Fließtext für AI-Prompting / Fallbacks aus strukturiertem Draft. */
export function buildCharacterNarrativeBackground(
  draft: CharacterProfileDraft,
): string {
  const { backgrounds, classes, flaws, jobs, quirks, races, signatureObjects, startItems } =
    CHARACTER_CREATION_CONTENT;

  const race = contentOptionById(races, draft.raceId);
  const cls = contentOptionById(classes, draft.classId);
  const job = contentOptionById(jobs, draft.jobId);
  const bg = contentOptionById(backgrounds, draft.backgroundId);
  const flaw = contentOptionById(flaws, draft.flawId);
  const quirk = contentOptionById(quirks, draft.quirkId);
  const sig = contentOptionById(signatureObjects, draft.signatureObjectId);
  const startItem = contentOptionById(startItems, draft.startItemId ?? null);

  const parts: string[] = [];
  if (race !== undefined && cls !== undefined) {
    parts.push(`Rasse: ${race.label}. Klasse: ${cls.label}.`);
  }
  if (job !== undefined && bg !== undefined) {
    parts.push(`Beruf: ${job.label} (${job.description})`);
    parts.push(`Background: ${bg.label} (${bg.description})`);
  }
  if (flaw !== undefined && quirk !== undefined && sig !== undefined) {
    parts.push(`Makel: ${flaw.label} — ${flaw.description}`);
    parts.push(`Eigenheit: ${quirk.label} — ${quirk.description}`);
    parts.push(`Signatur-Objekt: ${sig.label} — ${sig.description}`);
  }
  if (startItem !== undefined) {
    parts.push(`Startequipment: ${startItem.label} — ${startItem.description}`);
  }
  return parts.join(" ");
}
