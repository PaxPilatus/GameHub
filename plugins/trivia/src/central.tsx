import type { GameCentralProps } from "@game-hub/sdk";

import { type TriviaState } from "./reducer.js";

export function TriviaCentralView(props: GameCentralProps<TriviaState>) {
  const state = asTriviaState(props.gameState);

  if (state === null) {
    return <p className="hint-copy">Trivia state pending...</p>;
  }

  return (
    <div className="trivia-central-stage">
      <section className="trivia-stage-callout">
        <h3>{resolveTriviaStageTitle(state)}</h3>
        <p className="plugin-copy">{state.latestMessage}</p>
      </section>

      <div className="trivia-central-grid">
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
                    <span>{option.id.toUpperCase()} / {option.label}</span>
                    <strong>
                      {state.stage === "question" ? "Live" : String(summary?.responses ?? 0)}
                    </strong>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="trivia-summary">
            <h3>{state.stage === "results" ? "Final Results" : "Lobby"}</h3>
            <p className="plugin-copy">{state.latestMessage}</p>
          </section>
        )}

        <div className="trivia-score-column">
          {state.lastRoundSummary !== null ? (
            <section className="trivia-summary">
              <h3>Last Reveal</h3>
              <p className="plugin-copy">
                {state.lastRoundSummary.prompt} / Correct: <strong>{state.lastRoundSummary.correctOptionLabel}</strong>
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
                    <span>{entry.playerId} / Team {entry.team}</span>
                  </div>
                  <strong>{entry.score}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function resolveTriviaStageTitle(state: TriviaState): string {
  if (state.stage === "question") {
    return "Question " + String(state.questionNumber) + " / " + String(state.totalQuestions);
  }

  if (state.stage === "reveal") {
    return "Answer Reveal";
  }

  if (state.stage === "results") {
    return "Final Results";
  }

  return "Trivia Lobby";
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

export default TriviaCentralView;



