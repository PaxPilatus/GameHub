import type { GameCentralProps } from "@game-hub/sdk";

import type { PartyRpgState } from "./reducer.js";
import {
  isPartyRpgParticipantRole,
  PARTY_CONTINUE_ROUND,
  PARTY_HOST_NEXT_REVEAL,
  PARTY_HOST_SKIP_INTRO,
  PARTY_POINTS_ROUND_WIN,
  PARTY_RESTART,
  PARTY_SECONDS_SHOWCASE_STEP,
} from "./reducer.js";
import { ResilientImg } from "./resilient-img.js";
import {
  characterPlaceholderUrls,
  judgePlaceholderUrls,
  scenarioPlaceholderUrls,
  sortedPlayerIdsFromRows,
} from "./test-assets.js";

function asPartyState(value: unknown): PartyRpgState | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as PartyRpgState;
}

/** Union aus Session-Spielern und `playerRows`, damit die Ready-Liste nie nur einen Eintrag zeigt. */
function readinessPlayerIds(
  hubPlayers: GameCentralProps<PartyRpgState>["players"],
  rows: PartyRpgState["playerRows"],
): string[] {
  const union = new Set<string>();
  for (const row of rows) {
    union.add(row.playerId);
  }
  for (const player of hubPlayers) {
    if (player.role === "player") {
      union.add(player.playerId);
    }
  }
  return [...union].sort((a, b) => a.localeCompare(b));
}

function showcaseSegmentIndex(secondsRemaining: number): number {
  const step = PARTY_SECONDS_SHOWCASE_STEP;
  const elapsed = step - secondsRemaining;
  return Math.min(3, Math.floor((elapsed / step) * 4));
}

function segmentSpeaker(segmentIndex: number): "player" | "judge" {
  return segmentIndex === 0 || segmentIndex === 2 ? "player" : "judge";
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

  const sortedIds = sortedPlayerIdsFromRows(state.playerRows);
  const playerRoleSnapshots = props.players.filter((p) =>
    isPartyRpgParticipantRole(p.role),
  );
  const sortedPlayers = [...playerRoleSnapshots].sort((a, b) =>
    a.playerId.localeCompare(b.playerId),
  );

  const segIdx =
    state.stage === "showcase"
      ? showcaseSegmentIndex(state.secondsRemaining)
      : 0;
  const activeSpeaker = segmentSpeaker(segIdx);

  const winnerComment =
    state.roundWinnerId !== null
      ? state.showcaseEntries.find((e) => e.playerId === state.roundWinnerId)
          ?.judgeComment
      : undefined;

  return (
    <div className="party-rpg-central">
      <style>
        {`
          .party-rpg-central {
            min-height: 100%;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            background: #0a1018;
            color: #e8eef7;
            padding: 0.75rem 1rem 1rem;
            box-sizing: border-box;
          }
          .party-rpg-central-header h2 {
            margin: 0 0 0.25rem;
            color: #dbe7f7;
            font-size: 1.35rem;
          }
          .party-rpg-meta {
            margin: 0;
            font-size: 0.82rem;
            color: rgba(220, 230, 245, 0.72);
          }
          .party-rpg-latest {
            margin: 0.15rem 0 0;
            font-size: 0.88rem;
            color: #e8eef7;
          }
          .party-rpg-panel {
            border-radius: 0.85rem;
            border: 1px solid rgba(120, 160, 200, 0.22);
            background: rgba(12, 22, 34, 0.92);
            padding: 0.75rem 0.9rem;
          }
          .party-rpg-panel h3 {
            margin: 0 0 0.45rem;
            color: #dbe7f7;
            font-size: 1.05rem;
          }
          .party-rpg-panel p,
          .party-rpg-panel li {
            color: #e8eef7;
            line-height: 1.45;
          }
          .party-rpg-panel .party-rpg-muted {
            color: rgba(220, 230, 245, 0.72);
            font-size: 0.85rem;
          }
          .party-rpg-quest-hero {
            position: relative;
            border-radius: 0.9rem;
            overflow: hidden;
            border: 1px solid rgba(120, 160, 200, 0.25);
            background: #0a1018;
            aspect-ratio: 4 / 3;
            max-height: min(52vh, 22rem);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .party-rpg-quest-hero img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
          }
          .party-rpg-quest-scrim {
            position: absolute;
            inset: 0;
            background: linear-gradient(
              to top,
              rgba(8, 12, 18, 0.88) 0%,
              rgba(8, 12, 18, 0.25) 50%,
              rgba(8, 12, 18, 0.12) 100%
            );
            pointer-events: none;
          }
          .party-rpg-quest-body {
            position: relative;
            margin-top: 0.65rem;
            padding: 0;
          }
          .party-rpg-prompt {
            margin: 0.35rem 0 0;
            font-size: 0.95rem;
            color: #e8eef7;
          }
          .party-rpg-showcase {
            display: grid;
            gap: 0.65rem;
          }
          .party-rpg-showcase-portraits {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            align-items: flex-end;
            justify-content: center;
          }
          .party-rpg-showcase-portraits figure {
            margin: 0;
            text-align: center;
            width: 8.5rem;
          }
          .party-rpg-showcase-portraits figcaption {
            margin-top: 0.25rem;
            font-size: 0.75rem;
            color: rgba(220, 230, 245, 0.78);
          }
          .party-rpg-portrait-img {
            width: 8rem;
            height: 8rem;
            border-radius: 0.85rem;
            object-fit: cover;
            border: 2px solid rgba(120, 160, 200, 0.35);
            background: rgba(20, 32, 48, 0.9);
            transition: transform 0.2s ease;
          }
          .party-rpg-portrait-img.is-speaking {
            transform: scale(1.08);
            border-color: rgba(120, 200, 255, 0.65);
            animation: party-rpg-shake 0.45s ease-in-out infinite;
          }
          @keyframes party-rpg-shake {
            0%, 100% { transform: scale(1.08) translate(0, 0); }
            20% { transform: scale(1.08) translate(-2px, 1px); }
            40% { transform: scale(1.08) translate(2px, -1px); }
            60% { transform: scale(1.08) translate(-1px, -1px); }
            80% { transform: scale(1.08) translate(1px, 2px); }
          }
          .party-rpg-segment-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: grid;
            gap: 0.35rem;
          }
          .party-rpg-segment-list li {
            padding: 0.45rem 0.55rem;
            border-radius: 0.55rem;
            background: rgba(18, 28, 42, 0.95);
            border: 1px solid rgba(120, 160, 200, 0.15);
            font-size: 0.88rem;
          }
          .party-rpg-segment-list li.is-active {
            border-color: rgba(120, 200, 255, 0.55);
            background: rgba(24, 44, 72, 0.95);
          }
          .party-rpg-judge-row {
            display: flex;
            flex-direction: column;
            gap: 0.65rem;
          }
          .party-rpg-judge-top {
            display: flex;
            justify-content: center;
          }
          .party-rpg-judge-top figure {
            margin: 0;
            text-align: center;
          }
          .party-rpg-judge-top .party-rpg-portrait-img {
            width: 9rem;
            height: 9rem;
          }
          .party-rpg-players-row {
            display: flex;
            flex-wrap: wrap;
            gap: 0.65rem;
            justify-content: center;
          }
          .party-rpg-players-row figure {
            margin: 0;
            text-align: center;
            width: 7rem;
          }
          .party-rpg-players-row .party-rpg-portrait-img {
            width: 6.25rem;
            height: 6.25rem;
          }
          .party-rpg-players-row figure.is-winner .party-rpg-portrait-img {
            border-color: rgba(255, 214, 120, 0.85);
            box-shadow: 0 0 0 2px rgba(255, 214, 120, 0.35);
          }
          .party-rpg-verdict {
            margin: 0.35rem 0 0;
            font-size: 0.95rem;
            color: #e8eef7;
          }
          .party-rpg-judge-list {
            margin: 0.35rem 0 0;
            padding-left: 1.1rem;
            color: #e8eef7;
          }
          .party-rpg-judge-list li {
            margin-bottom: 0.35rem;
            color: #e8eef7;
          }
          .party-rpg-host-actions {
            margin-top: auto;
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            padding-top: 0.5rem;
          }
        `}
      </style>

      <header className="party-rpg-central-header">
        <h2>Party RPG</h2>
        <p className="party-rpg-meta">
          {state.stage} · Runde {String(state.roundIndex)}/
          {String(state.roundCount)} · {String(state.secondsRemaining)}s
        </p>
        <p className="party-rpg-latest">{state.latestMessage}</p>
        {state.llmMessage !== null ? (
          <p className="party-rpg-meta">{state.llmMessage}</p>
        ) : null}
      </header>

      {state.stage === "character_creation" || state.stage === "asset_generation" ? (
        <section className="party-rpg-panel">
          <h3>Bereitschaft</h3>
          <ul className="party-rpg-judge-list">
            {readinessPlayerIds(props.players, state.playerRows).map((playerId) => {
              const row = state.playerRows.find((entry) => entry.playerId === playerId);
              const meta = props.players.find(
                (player) => player.playerId === playerId,
              );
              const ready = row?.characterReady === true;
              return (
                <li key={playerId}>
                  <strong>{meta?.name ?? playerId}</strong> —{" "}
                  {ready ? "bereit" : "arbeitet"}
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
        <>
          <div className="party-rpg-quest-hero">
            <ResilientImg alt="" urls={scenarioPlaceholderUrls()} />
            <div className="party-rpg-quest-scrim" aria-hidden />
          </div>
          <div className="party-rpg-quest-body">
            <section className="party-rpg-panel">
              <h3>{situation.title}</h3>
              <p className="party-rpg-prompt">{situation.prompt}</p>
              {state.stage === "answer_collection" ? (
                <p className="party-rpg-muted">
                  Antworten:{" "}
                  {String(
                    state.playerRows.filter((row) => row.submittedAnswer).length,
                  )}
                  /{String(state.playerRows.length)}
                </p>
              ) : null}
            </section>
          </div>
        </>
      ) : null}

      {state.stage === "showcase" && activeEntry !== undefined && activePlayerId !== null ? (
        <section className="party-rpg-showcase">
          <div className="party-rpg-showcase-portraits">
            <figure>
              <ResilientImg
                alt=""
                className={
                  activeSpeaker === "player"
                    ? "party-rpg-portrait-img is-speaking"
                    : "party-rpg-portrait-img"
                }
                urls={characterPlaceholderUrls(activePlayerId, sortedIds)}
              />
              <figcaption>
                {activeCharacter?.displayName ?? activeEntry.playerId}
              </figcaption>
            </figure>
            <figure>
              <ResilientImg
                alt=""
                className={
                  activeSpeaker === "judge"
                    ? "party-rpg-portrait-img is-speaking"
                    : "party-rpg-portrait-img"
                }
                urls={judgePlaceholderUrls()}
              />
              <figcaption>Schiedsrichter</figcaption>
            </figure>
          </div>
          <section className="party-rpg-panel">
            <h3>Rezitation</h3>
            <ul className="party-rpg-segment-list">
              {activeEntry.narrationSegmentTexts.map((line, index) => (
                <li
                  className={index === segIdx ? "is-active" : undefined}
                  key={`${activeEntry.playerId}-seg-${String(index)}`}
                >
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </section>
      ) : null}

      {state.stage === "judge_deliberation" ? (
        <section className="party-rpg-panel party-rpg-judge-row">
          <div className="party-rpg-judge-top">
            <figure>
              <ResilientImg
                alt=""
                className="party-rpg-portrait-img"
                urls={judgePlaceholderUrls()}
              />
              <figcaption>Schiedsrichter</figcaption>
            </figure>
          </div>
          <div className="party-rpg-players-row">
            {sortedPlayers.map((player) => (
              <figure key={player.playerId}>
                <ResilientImg
                  alt=""
                  className="party-rpg-portrait-img"
                  urls={characterPlaceholderUrls(player.playerId, sortedIds)}
                />
                <figcaption>{player.name ?? player.playerId}</figcaption>
              </figure>
            ))}
          </div>
          <p className="party-rpg-verdict">
            {state.judgePipelineStatus === "running" || state.judgePipelineStatus === "queued"
              ? "Entscheidung faellt…"
              : "Bewertung wird vorbereitet…"}
          </p>
        </section>
      ) : null}

      {state.stage === "round_result" ? (
        <section className="party-rpg-panel party-rpg-judge-row">
          <div className="party-rpg-judge-top">
            <figure>
              <ResilientImg
                alt=""
                className="party-rpg-portrait-img"
                urls={judgePlaceholderUrls()}
              />
              <figcaption>Schiedsrichter</figcaption>
            </figure>
          </div>
          <p className="party-rpg-verdict">
            <strong>
              {winnerComment !== undefined &&
              winnerComment !== null &&
              winnerComment.trim() !== ""
                ? `${winnerComment} `
                : "Die Runde ist entschieden. "}
            </strong>
            +{String(PARTY_POINTS_ROUND_WIN)} Punkte fuer die beste Variante.
          </p>
          <div className="party-rpg-players-row">
            {sortedPlayers.map((player) => (
              <figure
                className={
                  player.playerId === state.roundWinnerId ? "is-winner" : undefined
                }
                key={player.playerId}
              >
                <ResilientImg
                  alt=""
                  className="party-rpg-portrait-img"
                  urls={characterPlaceholderUrls(player.playerId, sortedIds)}
                />
                <figcaption>{player.name ?? player.playerId}</figcaption>
              </figure>
            ))}
          </div>
          <h3>Rundenergebnis</h3>
          <p className="party-rpg-latest">
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
          <p className="party-rpg-latest">{state.latestMessage}</p>
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
