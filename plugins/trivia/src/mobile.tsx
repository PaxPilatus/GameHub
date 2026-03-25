import type { GameMobileProps } from "@game-hub/sdk";

import type { TriviaState } from "./reducer.js";

export function TriviaMobileView(props: GameMobileProps<TriviaState>) {
  const state = asTriviaState(props.gameState);
  const hasAnswered =
    props.playerId !== null &&
    state?.answeredPlayerIds.includes(props.playerId) === true;
  const question = state?.currentQuestion ?? null;

  if (state === null) {
    return <p className="hint-copy">Trivia state pending...</p>;
  }

  return (
    <div className="plugin-stack trivia-stack">
      <div className="trivia-banner">
        <strong>Trivia</strong>
        <span>
          {state.stage === "question"
            ? "Question " + String(state.questionNumber) + " / " + String(state.totalQuestions)
            : state.stage === "reveal"
              ? "Reveal"
              : state.stage === "results"
                ? "Results"
                : "Lobby"}
        </span>
      </div>

      {state.stage === "lobby" ? (
        <p className="plugin-copy">Host selected Trivia. Waiting for the host to start the quiz.</p>
      ) : null}

      {question !== null ? (
        <div className="trivia-question-card">
          <div className="plugin-stats">
            <span>{state.answerCount} / {state.totalEligibleAnswers} answered</span>
            <span>{state.secondsRemaining}s left</span>
          </div>
          <h3>{question.prompt}</h3>
          <div className="trivia-options">
            {question.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="trivia-option-button"
                disabled={
                  state.stage !== "question" ||
                  hasAnswered ||
                  props.phase !== "game_running"
                }
                onClick={() => props.sendInput("answer", option.id)}
              >
                <span>{option.id.toUpperCase()}</span>
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.stage === "question" ? (
        <p className="plugin-copy">
          {hasAnswered
            ? "Answer locked in. Waiting for the reveal."
            : "Choose one answer on your phone before the timer runs out."}
        </p>
      ) : null}

      {state.lastRoundSummary !== null && state.stage !== "question" ? (
        <section className="trivia-summary">
          <p className="plugin-copy">Correct answer: <strong>{state.lastRoundSummary.correctOptionLabel}</strong></p>
          <div className="trivia-response-list">
            {state.lastRoundSummary.responses.map((response) => (
              <div
                key={response.optionId}
                className={response.isCorrect ? "trivia-chip trivia-chip-correct" : "trivia-chip"}
              >
                <span>{response.label}</span>
                <strong>{response.responses}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="trivia-scoreboard">
        <div className="panel-header">
          <div>
            <h3>Scoreboard</h3>
            <p className="plugin-copy">{state.latestMessage}</p>
          </div>
        </div>
        {state.supportsTeams ? (
          <div className="trivia-team-grid">
            {state.teamScores.map((team) => (
              <div key={team.team} className="trivia-chip">
                <span>Team {team.team}</span>
                <strong>{team.score}</strong>
              </div>
            ))}
          </div>
        ) : null}
        <div className="trivia-score-list">
          {state.scores.map((entry) => (
            <div key={entry.playerId} className="trivia-score-row">
              <div>
                <strong>{entry.name}</strong>
                <span>Team {entry.team} / {entry.connected ? "online" : "offline"}</span>
              </div>
              <strong>{entry.score}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function asTriviaState(value: unknown): TriviaState | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    (value.stage !== "lobby" &&
      value.stage !== "question" &&
      value.stage !== "reveal" &&
      value.stage !== "results") ||
    !Array.isArray(value.answeredPlayerIds) ||
    !Array.isArray(value.scores) ||
    !Array.isArray(value.teamScores)
  ) {
    return null;
  }

  if (
    !isNullableQuestionView(value.currentQuestion) ||
    !isNullableRoundSummary(value.lastRoundSummary)
  ) {
    return null;
  }

  return value as TriviaState;
}

function isNullableQuestionView(value: unknown): boolean {
  return value === null || (isRecord(value) && typeof value.prompt === "string" && Array.isArray(value.options));
}

function isNullableRoundSummary(value: unknown): boolean {
  return value === null || (isRecord(value) && Array.isArray(value.responses));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default TriviaMobileView;
