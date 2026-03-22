import type { GameCentralProps } from "@game-hub/sdk";

import { TRIVIA_RESTART_ACTION, type TriviaState } from "./reducer.js";

export function TriviaCentralView(props: GameCentralProps<TriviaState>) {
  const state = props.pluginState;

  if (state === null) {
    return <p className="hint-copy">Trivia state pending...</p>;
  }

  return (
    <div className="plugin-stack trivia-stack">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Trivia Central</p>
          <h3>
            {state.stage === "question"
              ? "Question " + String(state.questionNumber) + " / " + String(state.totalQuestions)
              : state.stage === "reveal"
                ? "Answer Reveal"
                : state.stage === "results"
                  ? "Final Results"
                  : "Lobby"}
          </h3>
          <p className="plugin-copy">{state.latestMessage}</p>
        </div>
        <button
          type="button"
          onClick={() => void props.invokeHostAction(TRIVIA_RESTART_ACTION)}
        >
          Restart Quiz
        </button>
      </div>

      {state.currentQuestion !== null ? (
        <section className="trivia-question-card">
          <div className="plugin-stats">
            <span>{state.answerCount} / {state.totalEligibleAnswers} answers</span>
            <span>{state.secondsRemaining}s</span>
          </div>
          <h2>{state.currentQuestion.prompt}</h2>
          <div className="trivia-response-list">
            {state.currentQuestion.options.map((option) => {
              const summary = state.lastRoundSummary?.responses.find(
                (response) => response.optionId === option.id,
              );
              const isCorrect =
                state.stage !== "question" && summary?.isCorrect === true;

              return (
                <div
                  key={option.id}
                  className={isCorrect ? "trivia-chip trivia-chip-correct" : "trivia-chip"}
                >
                  <span>{option.id.toUpperCase()} · {option.label}</span>
                  <strong>
                    {state.stage === "question" ? "Live" : String(summary?.responses ?? 0)}
                  </strong>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {state.lastRoundSummary !== null ? (
        <section className="trivia-summary">
          <h3>Last Reveal</h3>
          <p className="plugin-copy">
            {state.lastRoundSummary.prompt} · Correct: <strong>{state.lastRoundSummary.correctOptionLabel}</strong>
          </p>
        </section>
      ) : null}

      {state.supportsTeams ? (
        <section className="trivia-scoreboard">
          <h3>Team Score</h3>
          <div className="trivia-team-grid">
            {state.teamScores.map((team) => (
              <div key={team.team} className="trivia-chip">
                <span>Team {team.team}</span>
                <strong>{team.score}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="trivia-scoreboard">
        <h3>Player Scoreboard</h3>
        <div className="trivia-score-list">
          {state.scores.map((entry) => (
            <div key={entry.playerId} className="trivia-score-row">
              <div>
                <strong>{entry.name}</strong>
                <span>{entry.playerId} · Team {entry.team}</span>
              </div>
              <strong>{entry.score}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default TriviaCentralView;