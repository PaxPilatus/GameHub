import type { GameMobileProps } from "@game-hub/sdk";
import React, { useEffect, type CSSProperties } from "react";

import { wizardStorageKey } from "./character-wizard-logic.js";
import { CharacterCreationWizard } from "./character-wizard.js";
import { PARTY_SUBMIT_ANSWER, type PartyRpgState } from "./reducer.js";
import { ResilientImg } from "./resilient-img.js";
import {
  characterPlaceholderUrls,
  scenarioPlaceholderUrls,
  sortedPlayerIdsFromSnapshots,
} from "./test-assets.js";

const answerPortraitStyle: CSSProperties = {
  borderRadius: "0.65rem",
  display: "block",
  height: "5rem",
  marginBottom: "0.5rem",
  objectFit: "cover",
  width: "5rem",
};

const scenarioImageStyle: CSSProperties = {
  borderRadius: "0.65rem",
  display: "block",
  marginBottom: "0.65rem",
  maxHeight: "12rem",
  objectFit: "contain",
  width: "100%",
};

function asPartyState(value: unknown): PartyRpgState | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as PartyRpgState;
}

export default function PartyMobileView(props: GameMobileProps<PartyRpgState>) {
  const state = asPartyState(props.gameState);

  if (state === null) {
    return <p className="hint-copy">Party RPG laedt…</p>;
  }

  const row =
    props.playerId === null
      ? undefined
      : state.playerRows.find((entry) => entry.playerId === props.playerId);

  const character =
    props.playerId === null
      ? undefined
      : state.characters.find((entry) => entry.playerId === props.playerId);

  const sortedPlayerIds = sortedPlayerIdsFromSnapshots(
    props.players,
    state.playerRows,
  );

  useEffect(() => {
    if (props.playerId === null || typeof sessionStorage === "undefined") {
      return;
    }
    if (state.stage !== "character_creation" || row?.characterReady === true) {
      try {
        sessionStorage.removeItem(wizardStorageKey(props.playerId));
      } catch {
        /* ignore */
      }
    }
  }, [props.playerId, row?.characterReady, state.stage]);

  return (
    <div className="plugin-stack party-rpg-stack">
      <div className="party-rpg-banner">
        <strong>Party RPG</strong>{" "}
        <span>
          {state.stage} · Runde {String(state.roundIndex)}/
          {String(state.roundCount)}
        </span>
      </div>

      <p className="plugin-copy">{state.latestMessage}</p>

      {state.stage === "character_creation" && props.playerId !== null ? (
        row?.characterReady === true ? (
          <section
            aria-live="polite"
            className="party-rpg-wizard party-rpg-form party-rpg-wizard-ready-panel"
          >
            <h2 className="party-rpg-step-headline">Profil gesendet</h2>
            <p className="plugin-copy">{state.latestMessage}</p>
            <p className="plugin-copy party-rpg-hint-muted">
              Warte, bis alle Spieler bereit sind — der Host setzt fort, sobald
              alle Profile bestätigt haben.
            </p>
          </section>
        ) : (
          <CharacterCreationWizard
            character={character}
            disabled={props.phase !== "game_running"}
            playerId={props.playerId}
            sendInput={props.sendInput}
            sortedPlayerIds={sortedPlayerIds}
          />
        )
      ) : null}

      {state.stage === "answer_collection" && props.playerId !== null ? (
        row?.submittedAnswer === true ? (
          <section aria-live="polite" className="party-rpg-form">
            {state.currentSituation !== null ? (
              <>
                <ResilientImg
                  alt=""
                  style={scenarioImageStyle}
                  urls={scenarioPlaceholderUrls()}
                />
                <h2 className="party-rpg-step-headline">
                  {state.currentSituation.title}
                </h2>
                <p className="plugin-copy">{state.currentSituation.prompt}</p>
              </>
            ) : null}
            <ResilientImg
              alt=""
              style={answerPortraitStyle}
              urls={characterPlaceholderUrls(props.playerId, sortedPlayerIds)}
            />
            <h2 className="party-rpg-step-headline">Antwort gesendet</h2>
            <p className="plugin-copy">
              Warte auf die anderen Spieler, bevor es weitergeht.
            </p>
          </section>
        ) : (
          <AnswerForm
            currentSituation={state.currentSituation}
            deadlineMs={state.answerDeadlineMs}
            disabled={props.phase !== "game_running"}
            playerId={props.playerId}
            portraitUrls={characterPlaceholderUrls(
              props.playerId,
              sortedPlayerIds,
            )}
            sendInput={props.sendInput}
          />
        )
      ) : null}

      {state.stage === "showcase" && props.playerId !== null ? (
        <p className="plugin-copy">
          Show laeuft auf dem Grossbild — bei dir nur Status, keine Spoiler von
          anderen.
        </p>
      ) : null}

      {state.stage === "match_result" ? (
        <p className="plugin-copy">Match vorbei — schaut auf die Buehne!</p>
      ) : null}
    </div>
  );
}

function readFormField(form: HTMLFormElement, name: string): string {
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return "";
}

function AnswerForm(props: {
  currentSituation: PartyRpgState["currentSituation"];
  deadlineMs: number | null;
  disabled: boolean;
  playerId: string;
  portraitUrls: readonly string[];
  sendInput: GameMobileProps<PartyRpgState>["sendInput"];
}): React.JSX.Element {
  return (
    <form
      className="party-rpg-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const text = readFormField(form, "answer");
        props.sendInput(PARTY_SUBMIT_ANSWER, {
          clientRequestId: `${String(Date.now())}-${props.playerId}`,
          text,
        });
      }}
    >
      {props.currentSituation !== null ? (
        <>
          <ResilientImg
            alt=""
            style={scenarioImageStyle}
            urls={scenarioPlaceholderUrls()}
          />
          <h2 className="party-rpg-step-headline">
            {props.currentSituation.title}
          </h2>
          <p className="plugin-copy">{props.currentSituation.prompt}</p>
        </>
      ) : null}
      <ResilientImg
        alt=""
        style={answerPortraitStyle}
        urls={props.portraitUrls}
      />
      <p className="plugin-stats">
        Deadline:{" "}
        {props.deadlineMs === null
          ? "—"
          : new Date(props.deadlineMs).toLocaleTimeString()}
      </p>
      <label className="plugin-copy">
        Deine private Antwort
        <textarea
          className="party-rpg-input"
          disabled={props.disabled}
          maxLength={280}
          name="answer"
          required
          rows={4}
        />
      </label>
      <button className="party-rpg-button" disabled={props.disabled} type="submit">
        Antwort senden
      </button>
    </form>
  );
}
