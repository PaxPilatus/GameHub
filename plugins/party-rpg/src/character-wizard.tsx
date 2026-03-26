import type { InputValue } from "@game-hub/protocol";
import type { GameMobileProps } from "@game-hub/sdk";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  CHARACTER_CREATION_CONTENT,
  contentOptionById,
} from "./character-content.js";
import {
  missingWitzmacherLabels,
  sanitizePersistedWizard,
  type PersistedWizardState,
  wizardStorageKey,
  WIZARD_STEP_COUNT,
  WIZARD_STORAGE_VERSION,
} from "./character-wizard-logic.js";
import type { PartyRpgState } from "./reducer.js";
import { ComedyRadarChart } from "./character-radar.js";
import { computeComedyProfileForDisplay } from "./comedy-profile.js";
import type { CharacterProfileDraft, ContentOption } from "./character-models.js";
import {
  suggestCharacterNames,
  suggestCharacterSlogans,
} from "./identity-suggestions.js";
import { buildCharacterSummaryPreview } from "./character-summary-preview.js";
import { PARTY_SUBMIT_CHARACTER, validateDraft } from "./reducer.js";
import { PLAYER_VOICE_A, PLAYER_VOICE_B } from "./voices.js";
import { ResilientImg } from "./resilient-img.js";
import { characterPlaceholderUrls } from "./test-assets.js";

const optionGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
};

const wizardNavStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  marginTop: "0.5rem",
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
};

const portraitBoxStyle: CSSProperties = {
  alignItems: "center",
  border: "2px dashed rgba(16, 36, 58, 0.2)",
  borderRadius: "0.85rem",
  display: "grid",
  gap: "0.25rem",
  justifyItems: "center",
  marginBottom: "0.5rem",
  minHeight: "5.5rem",
  padding: "0.75rem",
};

/** Host setzt Buttons auf helle Schrift — Options-Karten haben helle Flächen, daher immer dunkler Text. */
const OPTION_CARD_TEXT = "#10243a";
const OPTION_CARD_TEXT_MUTED = "rgba(16, 36, 58, 0.82)";

function optionCardStyle(selected: boolean): CSSProperties {
  return {
    background: selected ? "rgba(15, 139, 141, 0.18)" : "#ffffff",
    border: selected
      ? "2px solid #0a5960"
      : "1px solid rgba(16, 36, 58, 0.14)",
    borderRadius: "0.75rem",
    boxShadow: selected ? "0 0 0 2px rgba(15, 139, 141, 0.35)" : undefined,
    color: OPTION_CARD_TEXT,
    display: "grid",
    gap: "0.2rem",
    padding: "0.65rem 0.75rem",
    textAlign: "left",
  };
}

function emptyDraft(): CharacterProfileDraft {
  return {
    backgroundId: null,
    chosenName: "",
    chosenSlogan: "",
    classId: null,
    flawId: null,
    jobId: null,
    quirkId: null,
    raceId: null,
    signatureObjectId: null,
    startItemId: null,
    voiceProfileId: null,
  };
}

function readInitialWizardState(
  playerId: string,
  character: PartyRpgState["characters"][number] | undefined,
): { draft: CharacterProfileDraft; step: number } {
  if (typeof sessionStorage !== "undefined") {
    try {
      const raw = sessionStorage.getItem(wizardStorageKey(playerId));
      if (raw !== null) {
        const stored = sanitizePersistedWizard(JSON.parse(raw) as unknown);
        if (stored !== null) {
          return { draft: stored.draft, step: stored.step };
        }
      }
    } catch {
      /* ungueltiges JSON — leerer Wizard */
    }
  }

  const initial = emptyDraft();
  if (character !== undefined && character.displayName.trim() !== "") {
    initial.chosenName = character.displayName;
  }
  if (character !== undefined && character.slogan.trim() !== "") {
    initial.chosenSlogan = character.slogan;
  }
  return { draft: initial, step: 0 };
}

function OptionCard(props: {
  disabled: boolean;
  onSelect: (id: string) => void;
  option: ContentOption;
  selected: boolean;
}): React.JSX.Element {
  return (
    <button
      className={`party-rpg-option-card${props.selected ? " is-selected" : ""}`}
      disabled={props.disabled}
      onClick={() => {
        props.onSelect(props.option.id);
      }}
      style={optionCardStyle(props.selected)}
      type="button"
    >
      {props.selected ? (
        <span aria-hidden style={{ color: "#0a5960", fontSize: "0.75rem", fontWeight: 700 }}>
          Ausgewählt
        </span>
      ) : null}
      <span style={{ color: OPTION_CARD_TEXT, fontWeight: 600 }}>{props.option.label}</span>
      <span style={{ color: OPTION_CARD_TEXT_MUTED, fontSize: "0.85rem" }}>
        {props.option.description}
      </span>
    </button>
  );
}

function OptionGrid(props: {
  disabled: boolean;
  onSelect: (id: string) => void;
  options: ContentOption[];
  valueId: string | null;
}): React.JSX.Element {
  return (
    <div className="party-rpg-option-grid" style={optionGridStyle}>
      {props.options.map((option) => (
        <OptionCard
          disabled={props.disabled}
          key={option.id}
          onSelect={props.onSelect}
          option={option}
          selected={props.valueId === option.id}
        />
      ))}
    </div>
  );
}

export function CharacterCreationWizard(props: {
  character: PartyRpgState["characters"][number] | undefined;
  disabled: boolean;
  playerId: string;
  sendInput: GameMobileProps<PartyRpgState>["sendInput"];
  sortedPlayerIds: readonly string[];
}): React.JSX.Element {
  const [{ draft, step }, setWizardState] = useState(() =>
    readInitialWizardState(props.playerId, props.character),
  );

  const draftValidationError = validateDraft(draft);

  const skipScrollOnMount = useRef(true);
  useEffect(() => {
    if (skipScrollOnMount.current) {
      skipScrollOnMount.current = false;
      return;
    }
    const el = document.getElementById("party-rpg-wizard-top");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.scrollTo({ behavior: "smooth", left: 0, top: 0 });
  }, [step]);

  useEffect(() => {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    const key = wizardStorageKey(props.playerId);
    const handle = window.setTimeout(() => {
      try {
        const blob: PersistedWizardState = {
          draft,
          step,
          v: WIZARD_STORAGE_VERSION,
        };
        sessionStorage.setItem(key, JSON.stringify(blob));
      } catch {
        /* Quota oder Private Mode */
      }
    }, 280);
    return () => {
      window.clearTimeout(handle);
    };
  }, [draft, props.playerId, step]);

  const profile = useMemo(() => computeComedyProfileForDisplay(draft), [draft]);
  const nameSuggestions = useMemo(() => suggestCharacterNames(draft), [draft]);
  const sloganSuggestions = useMemo(() => suggestCharacterSlogans(draft), [draft]);
  const summaryPreview = useMemo(() => buildCharacterSummaryPreview(draft), [draft]);

  const canAdvanceStep0 = draft.raceId !== null && draft.classId !== null;
  const canAdvanceStep1 = draft.jobId !== null && draft.backgroundId !== null;
  const canAdvanceStep2 =
    draft.flawId !== null &&
    draft.quirkId !== null &&
    draft.signatureObjectId !== null &&
    draft.startItemId !== null;
  const trimmedName = draft.chosenName.trim();
  const slogOk =
    draft.chosenSlogan.trim().length >= 6 && draft.chosenSlogan.trim().length <= 60;
  const nameOk = trimmedName.length >= 2 && trimmedName.length <= 24;
  const canAdvanceStep3 = nameOk && slogOk;

  function updateDraft(partial: Partial<CharacterProfileDraft>): void {
    setWizardState((previous) => ({
      ...previous,
      draft: { ...previous.draft, ...partial },
    }));
  }

  function setStep(next: number | ((previous: number) => number)): void {
    setWizardState((previous) => {
      const raw = typeof next === "function" ? next(previous.step) : next;
      const clamped = Math.max(0, Math.min(WIZARD_STEP_COUNT - 1, raw));
      return { ...previous, step: clamped };
    });
  }

  function submitProfileAndReady(): void {
    const payload: Record<string, InputValue> = {
      backgroundId: draft.backgroundId ?? "",
      chosenName: draft.chosenName.trim(),
      chosenSlogan: draft.chosenSlogan.trim(),
      classId: draft.classId ?? "",
      clientRequestId: `${String(Date.now())}-${props.playerId}`,
      confirmReady: true,
      flawId: draft.flawId ?? "",
      jobId: draft.jobId ?? "",
      voiceProfileId: draft.voiceProfileId ?? "",
      quirkId: draft.quirkId ?? "",
      raceId: draft.raceId ?? "",
      signatureObjectId: draft.signatureObjectId ?? "",
      startItemId: draft.startItemId ?? "",
    };
    props.sendInput(PARTY_SUBMIT_CHARACTER, payload);
  }

  const navBack = (
    <button
      className="party-rpg-button secondary"
      disabled={props.disabled || step === 0}
      onClick={() => {
        setStep((previous) => Math.max(0, previous - 1));
      }}
      type="button"
    >
      Zurück
    </button>
  );

  return (
    <div
      className="party-rpg-wizard party-rpg-form"
      id="party-rpg-wizard-top"
    >
      <p className="party-rpg-step-indicator plugin-stats">
        Schritt {String(step + 1)}/{String(WIZARD_STEP_COUNT)}
      </p>

      {step === 0 ? (
        <>
          <h2 className="party-rpg-step-headline">Baue deinen Helden</h2>
          <p className="party-rpg-step-sub plugin-copy">Wähle Herkunft und Klasse</p>
          <p className="plugin-copy party-rpg-hint-muted">
            Stilprofil (keine Kampfwerte):
          </p>
          <div className="party-rpg-radar-inline" style={{ display: "flex", justifyContent: "center" }}>
            <ComedyRadarChart
              ariaLabel="Comedy-Stilprofil Vorschau"
              profile={profile}
              size="compact"
            />
          </div>
          <h3 className="party-rpg-field-label">Rasse</h3>
          <OptionGrid
            disabled={props.disabled}
            onSelect={(id) => {
              updateDraft({ raceId: id });
            }}
            options={CHARACTER_CREATION_CONTENT.races}
            valueId={draft.raceId}
          />
          <h3 className="party-rpg-field-label">Klasse</h3>
          <OptionGrid
            disabled={props.disabled}
            onSelect={(id) => {
              updateDraft({ classId: id });
            }}
            options={CHARACTER_CREATION_CONTENT.classes}
            valueId={draft.classId}
          />
          <div className="party-rpg-wizard-nav" style={wizardNavStyle}>
            {navBack}
            <button
              className="party-rpg-button"
              disabled={props.disabled || !canAdvanceStep0}
              onClick={() => {
                setStep(1);
              }}
              type="button"
            >
              Weiter
            </button>
          </div>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <h2 className="party-rpg-step-headline">
            Was hast du bisher mit deinem Leben gemacht?
          </h2>
          <div className="party-rpg-radar-inline" style={{ display: "flex", justifyContent: "center" }}>
            <ComedyRadarChart
              ariaLabel="Comedy-Stilprofil Vorschau"
              profile={profile}
              size="compact"
            />
          </div>
          <h3 className="party-rpg-field-label">Beruf</h3>
          <OptionGrid
            disabled={props.disabled}
            onSelect={(id) => {
              updateDraft({ jobId: id });
            }}
            options={CHARACTER_CREATION_CONTENT.jobs}
            valueId={draft.jobId}
          />
          <h3 className="party-rpg-field-label">Background</h3>
          <OptionGrid
            disabled={props.disabled}
            onSelect={(id) => {
              updateDraft({ backgroundId: id });
            }}
            options={CHARACTER_CREATION_CONTENT.backgrounds}
            valueId={draft.backgroundId}
          />
          <div className="party-rpg-wizard-nav" style={wizardNavStyle}>
            {navBack}
            <button
              className="party-rpg-button"
              disabled={props.disabled || !canAdvanceStep1}
              onClick={() => {
                setStep(2);
              }}
              type="button"
            >
              Weiter
            </button>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h2 className="party-rpg-step-headline">Jetzt wird’s persönlich</h2>
          <div className="party-rpg-radar-inline" style={{ display: "flex", justifyContent: "center" }}>
            <ComedyRadarChart
              ariaLabel="Comedy-Stilprofil Vorschau"
              profile={profile}
              size="compact"
            />
          </div>
          <h3 className="party-rpg-field-label">Makel</h3>
          <OptionGrid
            disabled={props.disabled}
            onSelect={(id) => {
              updateDraft({ flawId: id });
            }}
            options={CHARACTER_CREATION_CONTENT.flaws}
            valueId={draft.flawId}
          />
          <h3 className="party-rpg-field-label">Quirk</h3>
          <OptionGrid
            disabled={props.disabled}
            onSelect={(id) => {
              updateDraft({ quirkId: id });
            }}
            options={CHARACTER_CREATION_CONTENT.quirks}
            valueId={draft.quirkId}
          />
          <h3 className="party-rpg-field-label">Signatur-Objekt</h3>
          <OptionGrid
            disabled={props.disabled}
            onSelect={(id) => {
              updateDraft({ signatureObjectId: id });
            }}
            options={CHARACTER_CREATION_CONTENT.signatureObjects}
            valueId={draft.signatureObjectId}
          />
          <h3 className="party-rpg-field-label">Startequipment</h3>
          <p className="plugin-copy" style={{ fontSize: "0.88rem", marginBottom: "0.25rem" }}>
            Noch ein letztes Teil — dann geht’s weiter.
          </p>
          <OptionGrid
            disabled={props.disabled}
            onSelect={(id) => {
              updateDraft({ startItemId: id });
            }}
            options={CHARACTER_CREATION_CONTENT.startItems}
            valueId={draft.startItemId}
          />
          {(() => {
            const missing = missingWitzmacherLabels(draft);
            return missing.length > 0 && !props.disabled ? (
              <p className="plugin-copy" style={{ color: "#996515", fontSize: "0.85rem" }}>
                Bitte noch wählen: {missing.join(", ")}.
              </p>
            ) : null;
          })()}
          <div className="party-rpg-wizard-nav" style={wizardNavStyle}>
            {navBack}
            <button
              className="party-rpg-button"
              disabled={props.disabled || !canAdvanceStep2}
              onClick={() => {
                setStep(3);
              }}
              type="button"
            >
              Weiter
            </button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h2 className="party-rpg-step-headline">Gib deiner Legende einen Namen</h2>
          <div className="party-rpg-radar-inline" style={{ display: "flex", justifyContent: "center" }}>
            <ComedyRadarChart
              ariaLabel="Comedy-Stilprofil Vorschau"
              profile={profile}
              size="compact"
            />
          </div>
          <h3 className="party-rpg-field-label">Namensvorschläge</h3>
          <div className="party-rpg-chip-row" style={chipRowStyle}>
            {nameSuggestions.map((name) => (
              <button
                className="party-rpg-chip"
                disabled={props.disabled}
                key={name}
                onClick={() => {
                  updateDraft({ chosenName: name });
                }}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
          <label className="plugin-copy">
            Eigener Name (Pflicht, 2–24)
            <input
              className="party-rpg-input"
              disabled={props.disabled}
              maxLength={24}
              onChange={(event) => {
                updateDraft({ chosenName: event.target.value });
              }}
              value={draft.chosenName}
            />
          </label>
          <h3 className="party-rpg-field-label">Slogan-Vorschläge</h3>
          <div className="party-rpg-chip-row" style={chipRowStyle}>
            {sloganSuggestions.map((line) => (
              <button
                className="party-rpg-chip"
                disabled={props.disabled}
                key={line}
                onClick={() => {
                  updateDraft({ chosenSlogan: line });
                }}
                type="button"
              >
                {line}
              </button>
            ))}
          </div>
          <label className="plugin-copy">
            Eigener Slogan (Pflicht, 6–60)
            <input
              className="party-rpg-input"
              disabled={props.disabled}
              maxLength={60}
              onChange={(event) => {
                updateDraft({ chosenSlogan: event.target.value });
              }}
              value={draft.chosenSlogan}
            />
          </label>
          <div className="party-rpg-wizard-nav" style={wizardNavStyle}>
            {navBack}
            <button
              className="party-rpg-button"
              disabled={props.disabled || !canAdvanceStep3}
              onClick={() => {
                setStep(4);
              }}
              type="button"
            >
              Weiter
            </button>
          </div>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <h2 className="party-rpg-step-headline">Dein Charaktersheet</h2>
          <p className="plugin-copy party-rpg-hint-muted">
            Stilprofil — rein für Lesbarkeit & Spaß, nicht für „Power“.
          </p>
          <div className="party-rpg-portrait-placeholder" role="presentation" style={portraitBoxStyle}>
            <ResilientImg
              alt=""
              style={{
                borderRadius: "0.65rem",
                height: "5rem",
                objectFit: "cover",
                width: "5rem",
              }}
              urls={characterPlaceholderUrls(props.playerId, props.sortedPlayerIds)}
            />
            <span className="party-rpg-portrait-caption">Portrait — Platzhalter</span>
          </div>
          <div className="party-rpg-sheet-header">
            <p className="party-rpg-sheet-name">{draft.chosenName.trim()}</p>
            <p className="party-rpg-sheet-slogan">„{draft.chosenSlogan.trim()}”</p>
          </div>
          <ul className="party-rpg-sheet-facts plugin-copy">
            <li>
              <strong>Rasse / Klasse:</strong>{" "}
              {contentOptionById(CHARACTER_CREATION_CONTENT.races, draft.raceId)?.label ??
                "—"}{" "}
              /{" "}
              {contentOptionById(CHARACTER_CREATION_CONTENT.classes, draft.classId)
                ?.label ?? "—"}
            </li>
            <li>
              <strong>Beruf / Background:</strong>{" "}
              {contentOptionById(CHARACTER_CREATION_CONTENT.jobs, draft.jobId)?.label ??
                "—"}{" "}
              /{" "}
              {contentOptionById(
                CHARACTER_CREATION_CONTENT.backgrounds,
                draft.backgroundId,
              )?.label ?? "—"}
            </li>
            <li>
              <strong>Makel / Eigenheit / Objekt:</strong>{" "}
              {contentOptionById(CHARACTER_CREATION_CONTENT.flaws, draft.flawId)?.label ??
                "—"}
              {" · "}
              {contentOptionById(CHARACTER_CREATION_CONTENT.quirks, draft.quirkId)
                ?.label ?? "—"}
              {" · "}
              {contentOptionById(
                CHARACTER_CREATION_CONTENT.signatureObjects,
                draft.signatureObjectId,
              )?.label ?? "—"}
            </li>
            <li>
              <strong>Startequipment:</strong>{" "}
              {contentOptionById(
                CHARACTER_CREATION_CONTENT.startItems,
                draft.startItemId ?? null,
              )?.label ?? "—"}
            </li>
          </ul>
          <div className="party-rpg-radar-large" style={{ display: "flex", justifyContent: "center" }}>
            <ComedyRadarChart
              ariaLabel="Comedy-Stilprofil Übersicht"
              profile={profile}
              size="large"
            />
          </div>
          <section className="party-rpg-summary-preview">
            <h3 className="party-rpg-field-label">Vorschau</h3>
            <p className="plugin-copy">{summaryPreview}</p>
          </section>
          <h3 className="party-rpg-field-label">Stimme (Nur TTS)</h3>
          <p className="plugin-copy party-rpg-hint-muted" style={{ fontSize: "0.85rem" }}>
            Beeinflusst nur die Vorlese-Stimme, nicht die Mechanik.
          </p>
          <div className="party-rpg-chip-row" style={chipRowStyle}>
            <button
              className="party-rpg-chip"
              disabled={props.disabled}
              onClick={() => {
                updateDraft({ voiceProfileId: PLAYER_VOICE_A });
              }}
              type="button"
            >
              Stimme A
            </button>
            <button
              className="party-rpg-chip"
              disabled={props.disabled}
              onClick={() => {
                updateDraft({ voiceProfileId: PLAYER_VOICE_B });
              }}
              type="button"
            >
              Stimme B
            </button>
          </div>
          {draft.voiceProfileId !== null ? (
            <p className="plugin-stats" style={{ fontSize: "0.8rem" }}>
              Gewählt: {draft.voiceProfileId === PLAYER_VOICE_A ? "A" : "B"}
            </p>
          ) : null}
          <div className="party-rpg-wizard-nav" style={wizardNavStyle}>
            <button
              className="party-rpg-button secondary"
              disabled={props.disabled}
              onClick={() => {
                setStep(3);
              }}
              type="button"
            >
              Zurück und anpassen
            </button>
            <button
              className="party-rpg-button"
              disabled={
                props.disabled ||
                draftValidationError !== null
              }
              onClick={() => {
                submitProfileAndReady();
              }}
              type="button"
            >
              Bereit
            </button>
          </div>
          {draftValidationError !== null && !props.disabled ? (
            <p className="plugin-copy" style={{ color: "#9a3412", fontSize: "0.88rem" }}>
              {draftValidationError}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
