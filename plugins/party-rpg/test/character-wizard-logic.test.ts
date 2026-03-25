import { describe, expect, it } from "vitest";

import {
  missingWitzmacherLabels,
  sanitizePersistedWizard,
  WIZARD_STEP_COUNT,
  WIZARD_STORAGE_VERSION,
} from "../src/character-wizard-logic.js";
import type { CharacterProfileDraft } from "../src/character-models.js";

const fullDraft: CharacterProfileDraft = {
  backgroundId: "folk_hero",
  chosenName: "Zork",
  chosenSlogan: "Ich wuerfele wuerfeln!",
  classId: "fighter",
  flawId: "cannot_whisper",
  jobId: "smith",
  quirkId: "bows_on_intro",
  raceId: "human",
  signatureObjectId: "ominous_notebook",
  startItemId: "tent_hole_in_roof",
};

describe("character-wizard-logic", () => {
  it("missingWitzmacherLabels lists only unset Witzmacher fields", () => {
    const partial: CharacterProfileDraft = {
      ...fullDraft,
      flawId: null,
      signatureObjectId: null,
    };
    expect(missingWitzmacherLabels(partial).sort()).toEqual(
      ["Makel", "Signatur-Objekt"].sort(),
    );
  });

  it("sanitizePersistedWizard accepts valid stored blob", () => {
    const stored = {
      draft: fullDraft,
      step: 2,
      v: WIZARD_STORAGE_VERSION,
    };
    expect(sanitizePersistedWizard(stored)).toEqual(stored);
  });

  it("sanitizePersistedWizard rejects unknown option id", () => {
    const stored = {
      draft: { ...fullDraft, raceId: "not_a_real_race" },
      step: 0,
      v: WIZARD_STORAGE_VERSION,
    };
    expect(sanitizePersistedWizard(stored)).toBeNull();
  });

  it("sanitizePersistedWizard rejects bad step", () => {
    expect(
      sanitizePersistedWizard({
        draft: fullDraft,
        step: WIZARD_STEP_COUNT,
        v: WIZARD_STORAGE_VERSION,
      }),
    ).toBeNull();
  });
});
