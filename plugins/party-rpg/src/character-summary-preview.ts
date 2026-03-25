import { CHARACTER_CREATION_CONTENT, contentOptionById } from "./character-content.js";
import type { CharacterProfileDraft } from "./character-models.js";

function raceClassPhrase(raceLabel: string, classLabel: string): string {
  const lower = raceLabel.toLowerCase();
  if (lower === "mensch") {
    return `ein menschlicher ${classLabel}`;
  }
  return `ein ${raceLabel} und ${classLabel}`;
}

/** Lokale Template-Summary (4 Sätze), später durch AI ersetzbar. */
export function buildCharacterSummaryPreview(
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
  const start = contentOptionById(startItems, draft.startItemId ?? null);

  const name = draft.chosenName.trim();
  const slogan = draft.chosenSlogan.trim();

  if (
    race === undefined ||
    cls === undefined ||
    job === undefined ||
    bg === undefined ||
    flaw === undefined ||
    quirk === undefined ||
    sig === undefined ||
    start === undefined ||
    name === "" ||
    slogan === ""
  ) {
    return "";
  }

  const s1 = `${name} ist ${raceClassPhrase(race.label, cls.label)}.`;
  const s2 = `Beruflich: ${job.label}; Hintergrund: ${bg.label}.`;
  const s3 = `Auffällig: ${flaw.label}. Eigenheit: ${quirk.label}. Signatur: ${sig.label}. Dabei: ${start?.label ?? ""}.`;
  const s4 = `Motto: „${slogan}”.`;

  return [s1, s2, s3, s4].join(" ");
}
