import type { GameCentralProps } from "@game-hub/sdk";

import type { PartyRpgState } from "./reducer.js";
import {
  PARTY_CONTINUE_ROUND,
  PARTY_HOST_NEXT_REVEAL,
  PARTY_HOST_SKIP_INTRO,
  PARTY_RESTART,
} from "./reducer.js";

function asPartyState(value: unknown): PartyRpgState | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as PartyRpgState;
}

export default function PartyCentralView(
  props: GameCentralProps<PartyRpgState>,
) {
  const state = asPartyState(props.gameState);

  if (state === null) {
    return <p className="hint-copy">Party RPG laedt…</p>;
  }

  const situation = state.currentSituation;
  const activePlayerId = state.showcaseOrder[state.showcaseIndex] ?? null;
  const activeEntry =
    activePlayerId === null
      ? undefined
      : state.showcaseEntries.find((entry) => entry.playerId === activePlayerId);

  const activeCharacter =
    activePlayerId === null
      ? undefined
      : state.characters.find((entry) => entry.playerId === activePlayerId);

  return (
    <div className="party-rpg-central">
      <header className="party-rpg-central-header">
        <h2>Party RPG</h2>
        <p className="plugin-copy">
          {state.stage} · Runde {String(state.roundIndex)}/
          {String(state.roundCount)} · {String(state.secondsRemaining)}s
        </p>
        <p className="plugin-copy">{state.latestMessage}</p>
        {state.llmMessage !== null ? (
          <p className="plugin-copy muted">{state.llmMessage}</p>
        ) : null}
      </header>

      {state.stage === "character_creation" ||
      state.stage === "asset_generation" ? (
        <section className="party-rpg-panel">
          <h3>Bereitschaft</h3>
          <ul className="party-rpg-ready-list">
            {state.playerRows.map((row) => {
              const meta = props.players.find(
                (player) => player.playerId === row.playerId,
              );
              return (
                <li key={row.playerId}>
                  <strong>{meta?.name ?? row.playerId}</strong> —{" "}
                  {row.characterReady ? "bereit" : "arbeitet"}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {situation !== null &&
      (state.stage === "round_intro" ||
        state.stage === "answer_collection" ||
        state.stage === "llm_enrichment") ? (
        <section className="party-rpg-panel">
          <h3>{situation.title}</h3>
          <p className="party-rpg-prompt">{situation.prompt}</p>
          {state.stage === "answer_collection" ? (
            <p className="plugin-copy">
              Antworten:{" "}
              {String(
                state.playerRows.filter((row) => row.submittedAnswer).length,
              )}
              /{String(state.playerRows.length)}
            </p>
          ) : null}
        </section>
      ) : null}

      {state.stage === "showcase" && activeEntry !== undefined ? (
        <section className="party-rpg-showcase">
          <div className="party-rpg-portrait" aria-hidden>
            {activeCharacter?.portraitEmoji ?? "🎭"}
          </div>
          <h3>{activeCharacter?.displayName ?? activeEntry.playerId}</h3>
          <p className="party-rpg-narration">{activeEntry.narrationText}</p>
          {activeEntry.judgeComment !== null ? (
            <p className="party-rpg-judge">Judge: {activeEntry.judgeComment}</p>
          ) : null}
        </section>
      ) : null}

      {state.stage === "judge_deliberation" ? (
        <section className="party-rpg-panel">
          <h3>Judge</h3>
          <p className="plugin-copy">Entscheidung faellt…</p>
        </section>
      ) : null}

      {state.stage === "round_result" ? (
        <section className="party-rpg-panel">
          <h3>Rundenergebnis</h3>
          <p className="plugin-copy">
            Sieger:{" "}
            <strong>
              {props.players.find(
                (player) => player.playerId === state.roundWinnerId,
              )?.name ?? state.roundWinnerId}
            </strong>
          </p>
          <ul className="party-rpg-judge-list">
            {state.showcaseEntries.map((entry) => (
              <li key={entry.playerId}>
                <strong>
                  {props.players.find(
                    (player) => player.playerId === entry.playerId,
                  )?.name ?? entry.playerId}
                </strong>
                {entry.judgeComment !== null ? ` — ${entry.judgeComment}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.stage === "match_result" ? (
        <section className="party-rpg-panel">
          <h3>Match Ende</h3>
          <p className="plugin-copy">{state.latestMessage}</p>
        </section>
      ) : null}

      <footer className="party-rpg-host-actions">
        <button
          className="party-rpg-button"
          disabled={
            props.phase !== "game_running" || state.stage !== "round_intro"
          }
          type="button"
          onClick={() => {
            void props.invokeHostAction(PARTY_HOST_SKIP_INTRO);
          }}
        >
          Intro ueberspringen
        </button>
        <button
          className="party-rpg-button"
          disabled={
            props.phase !== "game_running" || state.stage !== "showcase"
          }
          type="button"
          onClick={() => {
            void props.invokeHostAction(PARTY_HOST_NEXT_REVEAL);
          }}
        >
          Naechster Reveal
        </button>
        <button
          className="party-rpg-button"
          disabled={
            props.phase !== "game_running" || state.stage !== "round_result"
          }
          type="button"
          onClick={() => {
            void props.invokeHostAction(PARTY_CONTINUE_ROUND);
          }}
        >
          Naechste Runde
        </button>
        <button
          className="party-rpg-button secondary"
          disabled={props.phase !== "game_running"}
          type="button"
          onClick={() => {
            void props.invokeHostAction(PARTY_RESTART);
          }}
        >
          Neu starten
        </button>
      </footer>
    </div>
  );
}
