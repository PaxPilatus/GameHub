import type { GamePlayerSnapshot } from "@game-hub/sdk";
import type { PlayerTeam } from "@game-hub/protocol";

export const TRIVIA_ANSWER_ACTION = "answer";
export const TRIVIA_RESTART_ACTION = "restart";
export const TRIVIA_QUESTION_LIMIT = 5;
export const TRIVIA_QUESTION_DURATION_SECONDS = 15;
export const TRIVIA_REVEAL_DURATION_SECONDS = 5;
export const TRIVIA_POINTS_PER_CORRECT = 100;

export interface TriviaOption {
  id: string;
  label: string;
}

export interface TriviaQuestionRecord {
  correctOptionId: string;
  id: string;
  options: TriviaOption[];
  prompt: string;
}

export interface TriviaQuestionView {
  id: string;
  options: TriviaOption[];
  prompt: string;
}

export interface TriviaOptionResult {
  isCorrect: boolean;
  label: string;
  optionId: string;
  responses: number;
}

export interface TriviaRoundSummary {
  correctOptionId: string;
  correctOptionLabel: string;
  prompt: string;
  questionId: string;
  responses: TriviaOptionResult[];
}

export interface TriviaScoreEntry {
  connected: boolean;
  name: string;
  playerId: string;
  score: number;
  team: PlayerTeam;
}

export interface TriviaTeamScore {
  score: number;
  team: PlayerTeam;
}

export type TriviaStage = "lobby" | "question" | "reveal" | "results";

export interface TriviaState extends Record<string, unknown> {
  answerCount: number;
  answeredPlayerIds: string[];
  currentQuestion: TriviaQuestionView | null;
  lastRoundSummary: TriviaRoundSummary | null;
  latestMessage: string;
  questionNumber: number;
  scores: TriviaScoreEntry[];
  secondsRemaining: number;
  stage: TriviaStage;
  supportsTeams: boolean;
  teamScores: TriviaTeamScore[];
  totalEligibleAnswers: number;
  totalQuestions: number;
}

export interface TriviaReducerContext {
  questionDurationSeconds: number;
  questions: TriviaQuestionRecord[];
  revealDurationSeconds: number;
  supportsTeams: boolean;
}

export interface TriviaEngineState {
  answersByPlayer: Record<string, string>;
  publicState: TriviaState;
  questionIndex: number | null;
}

export type TriviaEvent =
  | {
      players: GamePlayerSnapshot[];
      type: "answer_received";
      optionId: string;
      playerId: string;
    }
  | {
      players: GamePlayerSnapshot[];
      type: "game_started";
    }
  | {
      players: GamePlayerSnapshot[];
      type: "game_stopped";
    }
  | {
      players: GamePlayerSnapshot[];
      type: "restart_requested";
    }
  | {
      players: GamePlayerSnapshot[];
      type: "session_synced";
    }
  | {
      players: GamePlayerSnapshot[];
      type: "tick";
    };

export function createTriviaContext(
  questions: TriviaQuestionRecord[],
  options: Partial<
    Pick<
      TriviaReducerContext,
      "questionDurationSeconds" | "revealDurationSeconds" | "supportsTeams"
    >
  > = {},
): TriviaReducerContext {
  const normalizedQuestions = normalizeTriviaQuestions(questions).slice(
    0,
    TRIVIA_QUESTION_LIMIT,
  );

  if (normalizedQuestions.length === 0) {
    throw new Error("Trivia needs at least one question.");
  }

  return {
    questionDurationSeconds:
      options.questionDurationSeconds ?? TRIVIA_QUESTION_DURATION_SECONDS,
    questions: normalizedQuestions,
    revealDurationSeconds:
      options.revealDurationSeconds ?? TRIVIA_REVEAL_DURATION_SECONDS,
    supportsTeams: options.supportsTeams ?? false,
  };
}

export function createInitialTriviaEngineState(
  players: GamePlayerSnapshot[],
  context: TriviaReducerContext,
): TriviaEngineState {
  const scores = createScoreEntries(players, []);

  return {
    answersByPlayer: {},
    publicState: {
      answerCount: 0,
      answeredPlayerIds: [],
      currentQuestion: null,
      lastRoundSummary: null,
      latestMessage: "Waiting for host to start the trivia round.",
      questionNumber: 0,
      scores,
      secondsRemaining: 0,
      stage: "lobby",
      supportsTeams: context.supportsTeams,
      teamScores: createTeamScores(scores),
      totalEligibleAnswers: countEligiblePlayers(players),
      totalQuestions: context.questions.length,
    },
    questionIndex: null,
  };
}

export function reduceTriviaEngineState(
  state: TriviaEngineState,
  event: TriviaEvent,
  context: TriviaReducerContext,
): TriviaEngineState {
  switch (event.type) {
    case "game_started":
      return startGame(event.players, context);
    case "restart_requested":
      return startGame(event.players, context);
    case "game_stopped":
      return stopGame(syncPlayers(state, event.players, context), event.players, context);
    case "session_synced": {
      const syncedState = syncPlayers(state, event.players, context);
      return shouldRevealQuestion(syncedState, event.players)
        ? transitionToReveal(syncedState, event.players, context)
        : syncedState;
    }
    case "answer_received":
      return registerAnswer(state, event, context);
    case "tick":
      return advanceTimer(state, event.players, context);
    default:
      return state;
  }
}

export function normalizeTriviaQuestions(
  questions: TriviaQuestionRecord[],
): TriviaQuestionRecord[] {
  return questions.map((question, index) => normalizeQuestion(question, index));
}

function advanceTimer(
  state: TriviaEngineState,
  players: GamePlayerSnapshot[],
  context: TriviaReducerContext,
): TriviaEngineState {
  const syncedState = syncPlayers(state, players, context);

  if (shouldRevealQuestion(syncedState, players)) {
    return transitionToReveal(syncedState, players, context);
  }

  if (syncedState.publicState.stage === "question") {
    if (syncedState.publicState.secondsRemaining <= 1) {
      return transitionToReveal(syncedState, players, context);
    }

    return {
      ...syncedState,
      publicState: {
        ...syncedState.publicState,
        latestMessage: buildQuestionMessage(
          syncedState.publicState.questionNumber,
          syncedState.publicState.totalQuestions,
        ),
        secondsRemaining: syncedState.publicState.secondsRemaining - 1,
      },
    };
  }

  if (syncedState.publicState.stage === "reveal") {
    if (syncedState.publicState.secondsRemaining <= 1) {
      return advanceFromReveal(syncedState, players, context);
    }

    return {
      ...syncedState,
      publicState: {
        ...syncedState.publicState,
        secondsRemaining: syncedState.publicState.secondsRemaining - 1,
      },
    };
  }

  return syncedState;
}

function advanceFromReveal(
  state: TriviaEngineState,
  players: GamePlayerSnapshot[],
  context: TriviaReducerContext,
): TriviaEngineState {
  if (state.questionIndex === null) {
    return syncPlayers(state, players, context);
  }

  const nextQuestionIndex = state.questionIndex + 1;

  if (nextQuestionIndex >= context.questions.length) {
    return {
      answersByPlayer: {},
      publicState: {
        ...state.publicState,
        answerCount: 0,
        answeredPlayerIds: [],
        currentQuestion: null,
        latestMessage: "Quiz complete. Use restart to play another run.",
        questionNumber: context.questions.length,
        scores: createScoreEntries(players, state.publicState.scores),
        secondsRemaining: 0,
        stage: "results",
        teamScores: createTeamScores(
          createScoreEntries(players, state.publicState.scores),
        ),
        totalEligibleAnswers: countEligiblePlayers(players),
      },
      questionIndex: null,
    };
  }

  return createQuestionState(
    nextQuestionIndex,
    players,
    context,
    state.publicState.scores,
  );
}

function buildQuestionMessage(questionNumber: number, totalQuestions: number): string {
  return "Question " + String(questionNumber) + " of " + String(totalQuestions) + ".";
}

function countEligiblePlayers(players: GamePlayerSnapshot[]): number {
  return players.filter((player) => player.connected).length;
}

function getQuestion(
  context: TriviaReducerContext,
  questionIndex: number,
): TriviaQuestionRecord {
  const question = context.questions[questionIndex];

  if (question === undefined) {
    throw new Error("Missing trivia question at index " + String(questionIndex) + ".");
  }

  return question;
}

function createQuestionState(
  questionIndex: number,
  players: GamePlayerSnapshot[],
  context: TriviaReducerContext,
  previousScores: TriviaScoreEntry[],
): TriviaEngineState {
  const question = getQuestion(context, questionIndex);
  const scores = createScoreEntries(players, previousScores);

  return {
    answersByPlayer: {},
    publicState: {
      answerCount: 0,
      answeredPlayerIds: [],
      currentQuestion: toQuestionView(question),
      lastRoundSummary: null,
      latestMessage: buildQuestionMessage(questionIndex + 1, context.questions.length),
      questionNumber: questionIndex + 1,
      scores,
      secondsRemaining: context.questionDurationSeconds,
      stage: "question",
      supportsTeams: context.supportsTeams,
      teamScores: createTeamScores(scores),
      totalEligibleAnswers: countEligiblePlayers(players),
      totalQuestions: context.questions.length,
    },
    questionIndex,
  };
}

function createScoreEntries(
  players: GamePlayerSnapshot[],
  previousScores: TriviaScoreEntry[],
): TriviaScoreEntry[] {
  const previousScoreMap = new Map(
    previousScores.map((entry) => [entry.playerId, entry.score] as const),
  );

  return [...players]
    .map((player) => ({
      connected: player.connected,
      name: player.name,
      playerId: player.playerId,
      score: previousScoreMap.get(player.playerId) ?? 0,
      team: player.team,
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      return scoreDelta !== 0 ? scoreDelta : left.name.localeCompare(right.name);
    });
}

function createTeamScores(scores: TriviaScoreEntry[]): TriviaTeamScore[] {
  const scoreByTeam = new Map<PlayerTeam, number>([
    ["A", 0],
    ["B", 0],
  ]);

  for (const entry of scores) {
    scoreByTeam.set(entry.team, (scoreByTeam.get(entry.team) ?? 0) + entry.score);
  }

  return (["A", "B"] as const).map((team) => ({
    score: scoreByTeam.get(team) ?? 0,
    team,
  }));
}

function createSummary(
  answersByPlayer: Record<string, string>,
  question: TriviaQuestionRecord,
): TriviaRoundSummary {
  const responses = question.options.map((option) => ({
    isCorrect: option.id === question.correctOptionId,
    label: option.label,
    optionId: option.id,
    responses: Object.values(answersByPlayer).filter((answer) => answer === option.id).length,
  }));
  const correctOption = question.options.find(
    (option) => option.id === question.correctOptionId,
  );

  if (correctOption === undefined) {
    throw new Error("Trivia question is missing the correct option.");
  }

  return {
    correctOptionId: question.correctOptionId,
    correctOptionLabel: correctOption.label,
    prompt: question.prompt,
    questionId: question.id,
    responses,
  };
}

function getAnswerCount(
  answersByPlayer: Record<string, string>,
  players: GamePlayerSnapshot[],
): number {
  const eligiblePlayerIds = new Set(
    players.filter((player) => player.connected).map((player) => player.playerId),
  );

  return Object.keys(answersByPlayer).filter((playerId) => eligiblePlayerIds.has(playerId)).length;
}

function listAnsweredPlayerIds(answersByPlayer: Record<string, string>): string[] {
  return Object.keys(answersByPlayer).sort((left, right) => left.localeCompare(right));
}

function normalizeQuestion(
  question: TriviaQuestionRecord,
  index: number,
): TriviaQuestionRecord {
  if (question.id.trim() === "") {
    throw new Error("Question at index " + String(index) + " is missing an id.");
  }

  if (question.prompt.trim() === "") {
    throw new Error("Question " + question.id + " is missing a prompt.");
  }

  if (question.options.length !== 4) {
    throw new Error("Question " + question.id + " must have exactly four options.");
  }

  const optionIds = new Set<string>();
  for (const option of question.options) {
    if (option.id.trim() === "" || option.label.trim() === "") {
      throw new Error("Question " + question.id + " has an invalid option.");
    }

    if (optionIds.has(option.id)) {
      throw new Error("Question " + question.id + " has duplicate option ids.");
    }

    optionIds.add(option.id);
  }

  if (!optionIds.has(question.correctOptionId)) {
    throw new Error("Question " + question.id + " has an unknown correct option.");
  }

  return {
    correctOptionId: question.correctOptionId,
    id: question.id,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
    })),
    prompt: question.prompt,
  };
}

function registerAnswer(
  state: TriviaEngineState,
  event: Extract<TriviaEvent, { type: "answer_received" }>,
  context: TriviaReducerContext,
): TriviaEngineState {
  const syncedState = syncPlayers(state, event.players, context);

  if (
    syncedState.publicState.stage !== "question" ||
    syncedState.questionIndex === null
  ) {
    return syncedState;
  }

  const player = event.players.find(
    (candidate) => candidate.playerId === event.playerId,
  );
  const question = getQuestion(context, syncedState.questionIndex);

  if (
    player === undefined ||
    !player.connected ||
    syncedState.answersByPlayer[event.playerId] !== undefined ||
    !question.options.some((option) => option.id === event.optionId)
  ) {
    return syncedState;
  }

  const answersByPlayer = {
    ...syncedState.answersByPlayer,
    [event.playerId]: event.optionId,
  };
  const answerCount = getAnswerCount(answersByPlayer, event.players);
  const nextState: TriviaEngineState = {
    ...syncedState,
    answersByPlayer,
    publicState: {
      ...syncedState.publicState,
      answerCount,
      answeredPlayerIds: listAnsweredPlayerIds(answersByPlayer),
      latestMessage:
        "Collected " + String(answerCount) + " of " +
        String(countEligiblePlayers(event.players)) + " answers.",
      totalEligibleAnswers: countEligiblePlayers(event.players),
    },
  };

  return shouldRevealQuestion(nextState, event.players)
    ? transitionToReveal(nextState, event.players, context)
    : nextState;
}

function shouldRevealQuestion(
  state: TriviaEngineState,
  players: GamePlayerSnapshot[],
): boolean {
  return (
    state.publicState.stage === "question" &&
    state.publicState.totalEligibleAnswers > 0 &&
    getAnswerCount(state.answersByPlayer, players) >= state.publicState.totalEligibleAnswers
  );
}

function startGame(
  players: GamePlayerSnapshot[],
  context: TriviaReducerContext,
): TriviaEngineState {
  const zeroScores = players.map((player) => ({
    connected: player.connected,
    name: player.name,
    playerId: player.playerId,
    score: 0,
    team: player.team,
  }));

  return createQuestionState(0, players, context, zeroScores);
}

function stopGame(
  state: TriviaEngineState,
  players: GamePlayerSnapshot[],
  context: TriviaReducerContext,
): TriviaEngineState {
  const scores = createScoreEntries(players, state.publicState.scores);

  return {
    answersByPlayer: {},
    publicState: {
      ...state.publicState,
      answerCount: 0,
      answeredPlayerIds: [],
      currentQuestion: null,
      latestMessage: "Trivia stopped by host.",
      scores,
      secondsRemaining: 0,
      stage:
        state.publicState.lastRoundSummary === null &&
        scores.every((entry) => entry.score === 0)
          ? "lobby"
          : "results",
      supportsTeams: context.supportsTeams,
      teamScores: createTeamScores(scores),
      totalEligibleAnswers: countEligiblePlayers(players),
    },
    questionIndex: null,
  };
}

function syncPlayers(
  state: TriviaEngineState,
  players: GamePlayerSnapshot[],
  context: TriviaReducerContext,
): TriviaEngineState {
  const scores = createScoreEntries(players, state.publicState.scores);

  return {
    ...state,
    publicState: {
      ...state.publicState,
      answerCount: getAnswerCount(state.answersByPlayer, players),
      answeredPlayerIds: listAnsweredPlayerIds(state.answersByPlayer),
      scores,
      supportsTeams: context.supportsTeams,
      teamScores: createTeamScores(scores),
      totalEligibleAnswers: countEligiblePlayers(players),
      totalQuestions: context.questions.length,
    },
  };
}

function toQuestionView(question: TriviaQuestionRecord): TriviaQuestionView {
  return {
    id: question.id,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
    })),
    prompt: question.prompt,
  };
}

function transitionToReveal(
  state: TriviaEngineState,
  players: GamePlayerSnapshot[],
  context: TriviaReducerContext,
): TriviaEngineState {
  if (state.questionIndex === null) {
    return state;
  }

  const question = getQuestion(context, state.questionIndex);
  const updatedScores = state.publicState.scores.map((entry) => ({
    ...entry,
    score:
      entry.score +
      (state.answersByPlayer[entry.playerId] === question.correctOptionId
        ? TRIVIA_POINTS_PER_CORRECT
        : 0),
  }));
  const scores = createScoreEntries(players, updatedScores);

  return {
    ...state,
    publicState: {
      ...state.publicState,
      answerCount: getAnswerCount(state.answersByPlayer, players),
      answeredPlayerIds: listAnsweredPlayerIds(state.answersByPlayer),
      lastRoundSummary: createSummary(state.answersByPlayer, question),
      latestMessage: "Reveal: the correct answer is now visible.",
      scores,
      secondsRemaining: context.revealDurationSeconds,
      stage: "reveal",
      teamScores: createTeamScores(scores),
      totalEligibleAnswers: countEligiblePlayers(players),
    },
  };
}