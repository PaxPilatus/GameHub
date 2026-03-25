import type { InputMessage } from "@game-hub/protocol";
import {
  createGamePlugin,
  type GameControlsResolverContext,
  type GameHostApi,
} from "@game-hub/sdk";

import TriviaCentralView from "./central.js";
import TriviaMobileView from "./mobile.js";
import questions from "./questions.json" with { type: "json" };
import {
  TRIVIA_ANSWER_ACTION,
  TRIVIA_POINTS_PER_CORRECT,
  TRIVIA_RESTART_ACTION,
  createInitialTriviaEngineState,
  createTriviaContext,
  reduceTriviaEngineState,
  type TriviaQuestionRecord,
  type TriviaState,
} from "./reducer.js";

const triviaContext = createTriviaContext(questions as TriviaQuestionRecord[], {
  supportsTeams: true,
});

let runtimeState = createInitialTriviaEngineState([], triviaContext);

function applyState(
  api: GameHostApi<TriviaState>,
  nextState: typeof runtimeState,
): void {
  runtimeState = nextState;
  api.setState(nextState.publicState);
}

function asTriviaState(value: unknown): TriviaState | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray((value as TriviaState).scores) ||
    !Array.isArray((value as TriviaState).teamScores)
  ) {
    return null;
  }

  return value as TriviaState;
}

function buildTriviaControls(
  context: GameControlsResolverContext<TriviaState>,
) {
  const state = asTriviaState(context.gameState);
  const hasAnswered =
    context.playerId !== null &&
    state?.answeredPlayerIds.includes(context.playerId) === true;

  if (state === null) {
    return {
      controls: [
        {
          kind: "notice" as const,
          text: "Trivia state pending.",
        },
      ],
    };
  }

  if (state.stage !== "question" || state.currentQuestion === null) {
    return {
      controls: [
        {
          kind: "notice" as const,
          text: state.latestMessage,
        },
      ],
    };
  }

  return {
    controls: [
      {
        kind: "notice" as const,
        text: hasAnswered
          ? "Answer locked in. Waiting for the reveal."
          : `Question ${state.questionNumber} of ${state.totalQuestions}.`,
      },
      {
        action: TRIVIA_ANSWER_ACTION,
        disabled: hasAnswered || context.phase !== "game_running",
        kind: "options" as const,
        label: state.currentQuestion.prompt,
        options: state.currentQuestion.options.map((option) => ({
          id: option.id,
          label: `${option.id.toUpperCase()} ${option.label}`,
        })),
      },
    ],
  };
}

function parseAnswerPayload(message: InputMessage): string | undefined {
  return typeof message.value === "string" ? message.value : undefined;
}

function publishTriviaHubState(api: GameHostApi<TriviaState>): void {
  api.ui.publishStatusBadges([
    {
      id: "trivia-stage",
      label: "Stage",
      value: runtimeState.publicState.stage,
    },
    {
      id: "trivia-question",
      label: "Question",
      value: `${runtimeState.publicState.questionNumber}/${runtimeState.publicState.totalQuestions}`,
    },
    {
      id: "trivia-answers",
      label: "Answers",
      value: `${runtimeState.publicState.answerCount}/${runtimeState.publicState.totalEligibleAnswers}`,
    },
  ]);

  for (const score of runtimeState.publicState.scores) {
    api.results.setPlayerScore(score.playerId, score.score);
    api.results.setPlayerStatus(
      score.playerId,
      score.connected ? "connected" : "offline",
    );
  }

  for (const teamScore of runtimeState.publicState.teamScores) {
    api.results.setTeamScore(teamScore.team, teamScore.score);
  }

  if (runtimeState.publicState.stage === "results") {
    api.ui.setOverlay({
      message: runtimeState.publicState.latestMessage,
      title: "Trivia finished",
      tone: "success",
    });
    return;
  }

  api.ui.clearOverlay();
}

function publishTriviaPlacements(api: GameHostApi<TriviaState>): void {
  runtimeState.publicState.scores.forEach((entry, index) => {
    api.results.recordPlacement(entry.playerId, index + 1);
  });
}

function syncPlayers(
  api: GameHostApi<TriviaState>,
): void {
  applyState(
    api,
    reduceTriviaEngineState(runtimeState, {
      players: api.getPlayers(),
      type: "session_synced",
    }, triviaContext),
  );
  publishTriviaHubState(api);
}

export const gamePlugin = createGamePlugin<TriviaState, string | undefined>({
  central: TriviaCentralView,
  controls: buildTriviaControls,
  createInitialState() {
    return createInitialTriviaEngineState([], triviaContext).publicState;
  },
  manifest: {
    description: "Five-round trivia with timed answers, reveal and scoreboard.",
    displayName: "Trivia",
    id: "trivia",
    supportsTeams: true,
    tickHz: 1,
    version: "0.2.0",
  },
  mobile: TriviaMobileView,
  parseInput(message) {
    return parseAnswerPayload(message);
  },
  server: {
    onGameStart(api) {
      applyState(
        api,
        reduceTriviaEngineState(runtimeState, {
          players: api.getPlayers(),
          type: "game_started",
        }, triviaContext),
      );
      api.results.clearLeaderboard();
      publishTriviaHubState(api);
      api.log("info", "trivia_started", "Trivia round started.", {
        questions: triviaContext.questions.length,
      });
    },
    onGameStop(api) {
      applyState(
        api,
        reduceTriviaEngineState(runtimeState, {
          players: api.getPlayers(),
          type: "game_stopped",
        }, triviaContext),
      );
      publishTriviaHubState(api);
    },
    onInput(api, input) {
      const previousStage = runtimeState.publicState.stage;

      if (input.action === TRIVIA_ANSWER_ACTION && typeof input.payload === "string") {
        applyState(
          api,
          reduceTriviaEngineState(runtimeState, {
            optionId: input.payload,
            playerId: input.playerId,
            players: api.getPlayers(),
            type: "answer_received",
          }, triviaContext),
        );
        publishTriviaHubState(api);

        if (
          previousStage !== "reveal" &&
          runtimeState.publicState.stage === "reveal" &&
          runtimeState.publicState.lastRoundSummary !== null
        ) {
          api.results.endRound({
            message: `Correct answer: ${runtimeState.publicState.lastRoundSummary.correctOptionLabel}`,
            title: `Reveal ${runtimeState.publicState.questionNumber}`,
          });
        }
        return;
      }

      if (input.action === TRIVIA_RESTART_ACTION) {
        applyState(
          api,
          reduceTriviaEngineState(runtimeState, {
            players: api.getPlayers(),
            type: "restart_requested",
          }, triviaContext),
        );
        api.results.clearLeaderboard();
        publishTriviaHubState(api);
        api.log("info", "trivia_restarted", "Trivia quiz restarted by host action.", {});
      }
    },
    onPlayerJoin(api) {
      syncPlayers(api);
    },
    onPlayerLeave(api) {
      syncPlayers(api);
    },
    onPlayerReconnect(api) {
      syncPlayers(api);
    },
    onSessionCreated(api) {
      runtimeState = createInitialTriviaEngineState(api.getPlayers(), triviaContext);
      api.results.clearLeaderboard();
      api.setState(runtimeState.publicState);
      publishTriviaHubState(api);
      api.log("info", "trivia_session_created", "Trivia plugin attached to session.", {
        supportsTeams: true,
      });
    },
    onTick(api) {
      const previousStage = runtimeState.publicState.stage;

      applyState(
        api,
        reduceTriviaEngineState(runtimeState, {
          players: api.getPlayers(),
          type: "tick",
        }, triviaContext),
      );
      publishTriviaHubState(api);

      if (
        previousStage !== "reveal" &&
        runtimeState.publicState.stage === "reveal" &&
        runtimeState.publicState.lastRoundSummary !== null
      ) {
        api.results.endRound({
          message: `Correct answer: ${runtimeState.publicState.lastRoundSummary.correctOptionLabel}`,
          title: `Reveal ${runtimeState.publicState.questionNumber}`,
        });
      }

      if (
        previousStage !== "results" &&
        runtimeState.publicState.stage === "results"
      ) {
        publishTriviaPlacements(api);
        api.results.endMatch({
          message: runtimeState.publicState.latestMessage,
          title: "Trivia finished",
        });
      }
    },
  },
});

export const manifest = gamePlugin.manifest;
export default gamePlugin;
export { TRIVIA_POINTS_PER_CORRECT };
