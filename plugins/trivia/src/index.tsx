import type { InputMessage } from "@game-hub/protocol";
import { createGamePlugin, type GameHostApi } from "@game-hub/sdk";

import TriviaCentralView from "./central.js";
import TriviaMobileView from "./mobile.js";
import questions from "./questions.json" with { type: "json" };
import {
  TRIVIA_ANSWER_ACTION,
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

function parseAnswerPayload(message: InputMessage): string | undefined {
  return typeof message.value === "string" ? message.value : undefined;
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
}

export const gamePlugin = createGamePlugin<TriviaState, string | undefined>({
  central: TriviaCentralView,
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
    },
    onInput(api, input) {
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
      api.setState(runtimeState.publicState);
      api.log("info", "trivia_session_created", "Trivia plugin attached to session.", {
        supportsTeams: true,
      });
    },
    onTick(api) {
      applyState(
        api,
        reduceTriviaEngineState(runtimeState, {
          players: api.getPlayers(),
          type: "tick",
        }, triviaContext),
      );
    },
  },
});

export const manifest = gamePlugin.manifest;
export default gamePlugin;