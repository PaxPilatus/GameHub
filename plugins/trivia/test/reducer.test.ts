import { describe, expect, it } from "vitest";

import type { GamePlayerSnapshot } from "@game-hub/sdk";

import {
  createInitialTriviaEngineState,
  createTriviaContext,
  reduceTriviaEngineState,
  type TriviaQuestionRecord,
} from "../src/reducer.js";

const TEST_QUESTIONS: TriviaQuestionRecord[] = [
  {
    correctOptionId: "a",
    id: "q1",
    options: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma" },
      { id: "d", label: "Delta" },
    ],
    prompt: "Question one?",
  },
  {
    correctOptionId: "c",
    id: "q2",
    options: [
      { id: "a", label: "One" },
      { id: "b", label: "Two" },
      { id: "c", label: "Three" },
      { id: "d", label: "Four" },
    ],
    prompt: "Question two?",
  },
];

const TEST_PLAYERS: GamePlayerSnapshot[] = [
  {
    connected: true,
    lastSeen: 1,
    name: "Alice",
    playerId: "p1",
    role: "moderator",
    team: "A",
  },
  {
    connected: true,
    lastSeen: 1,
    name: "Bob",
    playerId: "p2",
    role: "player",
    team: "B",
  },
];

describe("trivia reducer", () => {
  it("starts in question mode and reveals immediately when all players answered", () => {
    const context = createTriviaContext(TEST_QUESTIONS, {
      questionDurationSeconds: 20,
      revealDurationSeconds: 3,
      supportsTeams: true,
    });
    let state = createInitialTriviaEngineState(TEST_PLAYERS, context);

    state = reduceTriviaEngineState(
      state,
      {
        players: TEST_PLAYERS,
        type: "game_started",
      },
      context,
    );

    expect(state.publicState.stage).toBe("question");
    expect(state.publicState.questionNumber).toBe(1);
    expect(state.publicState.currentQuestion?.prompt).toBe("Question one?");

    state = reduceTriviaEngineState(
      state,
      {
        optionId: "a",
        playerId: "p1",
        players: TEST_PLAYERS,
        type: "answer_received",
      },
      context,
    );

    expect(state.publicState.stage).toBe("question");
    expect(state.publicState.answerCount).toBe(1);

    state = reduceTriviaEngineState(
      state,
      {
        optionId: "b",
        playerId: "p2",
        players: TEST_PLAYERS,
        type: "answer_received",
      },
      context,
    );

    expect(state.publicState.stage).toBe("reveal");
    expect(state.publicState.lastRoundSummary?.correctOptionId).toBe("a");
    expect(state.publicState.scores.map((entry) => [entry.playerId, entry.score])).toEqual([
      ["p1", 100],
      ["p2", 0],
    ]);
    expect(state.publicState.teamScores).toEqual([
      { score: 100, team: "A" },
      { score: 0, team: "B" },
    ]);
  });

  it("advances deterministically on timer ticks until the result screen", () => {
    const context = createTriviaContext(TEST_QUESTIONS, {
      questionDurationSeconds: 1,
      revealDurationSeconds: 1,
      supportsTeams: true,
    });
    let state = reduceTriviaEngineState(
      createInitialTriviaEngineState(TEST_PLAYERS, context),
      {
        players: TEST_PLAYERS,
        type: "game_started",
      },
      context,
    );

    state = reduceTriviaEngineState(
      state,
      {
        players: TEST_PLAYERS,
        type: "tick",
      },
      context,
    );
    expect(state.publicState.stage).toBe("reveal");
    expect(state.publicState.lastRoundSummary?.correctOptionId).toBe("a");

    state = reduceTriviaEngineState(
      state,
      {
        players: TEST_PLAYERS,
        type: "tick",
      },
      context,
    );
    expect(state.publicState.stage).toBe("question");
    expect(state.publicState.questionNumber).toBe(2);

    state = reduceTriviaEngineState(
      state,
      {
        players: TEST_PLAYERS,
        type: "tick",
      },
      context,
    );
    expect(state.publicState.stage).toBe("reveal");
    expect(state.publicState.lastRoundSummary?.correctOptionId).toBe("c");

    state = reduceTriviaEngineState(
      state,
      {
        players: TEST_PLAYERS,
        type: "tick",
      },
      context,
    );
    expect(state.publicState.stage).toBe("results");
    expect(state.publicState.currentQuestion).toBeNull();
    expect(state.publicState.questionNumber).toBe(2);
  });

  it("resets scores and round progress on restart", () => {
    const context = createTriviaContext(TEST_QUESTIONS, {
      questionDurationSeconds: 20,
      revealDurationSeconds: 2,
      supportsTeams: true,
    });
    let state = reduceTriviaEngineState(
      createInitialTriviaEngineState(TEST_PLAYERS, context),
      {
        players: TEST_PLAYERS,
        type: "game_started",
      },
      context,
    );

    state = reduceTriviaEngineState(
      state,
      {
        optionId: "a",
        playerId: "p1",
        players: TEST_PLAYERS,
        type: "answer_received",
      },
      context,
    );
    state = reduceTriviaEngineState(
      state,
      {
        optionId: "b",
        playerId: "p2",
        players: TEST_PLAYERS,
        type: "answer_received",
      },
      context,
    );

    expect(state.publicState.stage).toBe("reveal");
    expect(state.publicState.scores[0]?.score).toBe(100);

    state = reduceTriviaEngineState(
      state,
      {
        players: TEST_PLAYERS,
        type: "restart_requested",
      },
      context,
    );

    expect(state.publicState.stage).toBe("question");
    expect(state.publicState.questionNumber).toBe(1);
    expect(state.publicState.lastRoundSummary).toBeNull();
    expect(state.publicState.scores.map((entry) => entry.score)).toEqual([0, 0]);
  });
});