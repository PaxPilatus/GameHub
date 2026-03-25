/**
 * Character creation domain types (Party RPG).
 * Comedy axes are stylistic identity only — not power or combat stats.
 */

export type ContentOption = {
  id: string;
  label: string;
  description: string;
  tags: string[];
};

export type CharacterCreationContent = {
  races: ContentOption[];
  classes: ContentOption[];
  jobs: ContentOption[];
  backgrounds: ContentOption[];
  flaws: ContentOption[];
  quirks: ContentOption[];
  signatureObjects: ContentOption[];
  startItems: ContentOption[];
};

/** Wire + client draft before validation (null = not chosen yet). */
export type CharacterProfileDraft = {
  raceId: string | null;
  classId: string | null;
  jobId: string | null;
  backgroundId: string | null;
  flawId: string | null;
  quirkId: string | null;
  signatureObjectId: string | null;
  startItemId: string | null;
  chosenName: string;
  chosenSlogan: string;
};

export type ComedyAxisKey =
  | "drama"
  | "chaos"
  | "ego"
  | "style"
  | "competence"
  | "bad_luck";

export type ComedyProfile = Record<ComedyAxisKey, number>;

export const COMEDY_AXIS_KEYS: ComedyAxisKey[] = [
  "drama",
  "chaos",
  "ego",
  "style",
  "competence",
  "bad_luck",
];

export const COMEDY_AXIS_LABELS_DE: Record<ComedyAxisKey, string> = {
  bad_luck: "Pech/Friction",
  chaos: "Chaos",
  competence: "Serienkompetenz",
  drama: "Drama",
  ego: "Ego-Glanz",
  style: "Stil",
};
