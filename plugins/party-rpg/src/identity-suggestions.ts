import { CHARACTER_CREATION_CONTENT, contentOptionById } from "./character-content.js";
import type { CharacterProfileDraft } from "./character-models.js";
import { computeComedyProfileRaw } from "./comedy-profile.js";

function djb2(input: string): number {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return Math.abs(hash);
}

function pick<T>(list: T[], seed: number, offset: number): T {
  const item = list[(seed + offset) % list.length];
  if (item === undefined) {
    throw new Error("identity_suggestions_empty_pool");
  }
  return item;
}

const NAME_PREFIXES = [
  "Sir",
  "Lady",
  "Bruder",
  "Schwester",
  "Baron",
  "Kapitän",
  "Meister",
  "Excellenz",
];

const NAME_CORES = [
  "Kontorfaust",
  "Wackelstein",
  "Bilanzhammer",
  "Ordnerklinge",
  "Protokollzahn",
  "Memoheld",
  "Archivauge",
  "Pergamentpracht",
  "Siegelbeule",
  "Stempelglanz",
  "Federschreck",
  "Paragraphenpfeil",
];

const NAME_SUFFIXES = [
  "von Zufallstein",
  "der Erstaunlich Vorbereitete",
  "aus der Nebenhandlung",
  "mit dem Ehrenlaminat",
  "Erster Klasse",
  "zweiter Versuch",
  "in Ehren gehalten",
  "mit Ordnern im Rücken",
];

const SLOGAN_TEMPLATES = [
  "Chaos zuerst, Fragen später.",
  "Respektiert den Hut.",
  "Ich improvisiere mit Würde.",
  "Ordnung ist auch nur Drama mit Formularen.",
  "Stil ist mein Standard.",
  "Ich bringe Pathos in den Alltag.",
  "Heute wieder gekonnt übertrieben.",
  "Wenn’s peinlich ist, geh ich vor.",
  "Mit Herz, Ego und einem Stift.",
  "Nicht perfekt — aber aufwendig.",
  "Details sind optional — Wirkung nicht.",
  "Ich bin die Fußnote des Schicksals.",
  "Fakten sind Verhandlungssache.",
  "Kompromisslos theatralisch.",
  "Ich habe einen Plan. Irgendwo.",
];

function selectionFingerprint(draft: CharacterProfileDraft): string {
  const parts = [
    draft.raceId ?? "",
    draft.classId ?? "",
    draft.jobId ?? "",
    draft.backgroundId ?? "",
    draft.flawId ?? "",
    draft.quirkId ?? "",
    draft.signatureObjectId ?? "",
    draft.startItemId ?? "",
  ];
  return parts.join("|");
}

function tagHints(draft: CharacterProfileDraft): string[] {
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
  const tags: string[] = [];
  for (const option of options) {
    if (option !== undefined) {
      tags.push(...option.tags);
    }
  }
  return tags;
}

/** 3–5 einzigartige Namensvorschläge, leichtgewichtig aus Tags + Auswahl abgeleitet. */
export function suggestCharacterNames(draft: CharacterProfileDraft): string[] {
  const seed = djb2(selectionFingerprint(draft));
  const tags = tagHints(draft);
  const tagSeed = djb2(tags.sort().join(","));

  const profile = computeComedyProfileRaw(draft);
  const dramaLean = profile.drama >= profile.chaos ? 1 : 0;

  const names = new Set<string>();
  let offset = 0;
  while (names.size < 5 && offset < 40) {
    const prefix = pick(NAME_PREFIXES, seed + dramaLean, offset);
    const core = pick(NAME_CORES, tagSeed, offset * 3);
    const suffix = pick(NAME_SUFFIXES, seed ^ tagSeed, offset + dramaLean);
    const variantA = `${prefix} ${core}`;
    const variantB = `${core} ${suffix}`;
    const variantC =
      tags.includes("noble") || tags.includes("formal")
        ? `${prefix} ${pick(NAME_CORES, tagSeed, offset + 7)} ${pick(["von Klemmbox", "von Randundband"], seed, offset)}`
        : variantA;

    for (const candidate of [variantA, variantB, variantC]) {
      const trimmed = candidate.trim().slice(0, 24);
      if (trimmed.length >= 2) {
        names.add(trimmed);
      }
      if (names.size >= 5) {
        break;
      }
    }
    offset += 1;
  }

  return [...names].slice(0, 5);
}

/** 3–5 einzigartige Slogan-Vorschläge. */
export function suggestCharacterSlogans(draft: CharacterProfileDraft): string[] {
  const seed = djb2(`${selectionFingerprint(draft)}::slogan`);
  const slogans = new Set<string>();
  let index = 0;
  while (slogans.size < 5 && index < SLOGAN_TEMPLATES.length + 10) {
    const line = pick(SLOGAN_TEMPLATES, seed, index);
    const normalized = line.trim();
    if (normalized.length >= 6 && normalized.length <= 60) {
      slogans.add(normalized);
    }
    index += 1;
  }
  return [...slogans].slice(0, 5);
}
