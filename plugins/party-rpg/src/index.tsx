import type { InputMessage } from "@game-hub/protocol";
import {
  createAiGateway,
  type AiGateway,
  type AiGatewayConfig,
} from "@game-hub/ai-gateway";
import {
  createGamePlugin,
  type GameHostApi,
  type GamePlayerSnapshot,
} from "@game-hub/sdk";

import PartyCentralView from "./central.js";
import {
  buildAiCharacterSummaryExtras,
  buildCharacterNarrativeBackground,
} from "./draft-narrative.js";
import { buildCharacterSummaryPreview } from "./character-summary-preview.js";
import PartyMobileView from "./mobile.js";
import {
  PARTY_CONFIRM_READY,
  PARTY_CONTINUE_ROUND,
  PARTY_HOST_NEXT_REVEAL,
  PARTY_HOST_SKIP_INTRO,
  PARTY_RESTART,
  PARTY_POINTS_ROUND_WIN,
  PARTY_SUBMIT_ANSWER,
  PARTY_SUBMIT_CHARACTER,
  type PartyRpgCharacterDraft,
  type PartyRpgEngineState,
  type PartyRpgSituation,
  type PartyRpgState,
  createInitialPartyRpgEngineState,
  parseCharacterDraftPayload,
  reducePartyRpgEngineState,
} from "./reducer.js";
import situations from "./situations.json" with { type: "json" };

const situ: PartyRpgSituation[] = situations as PartyRpgSituation[];

let runtimeState = createInitialPartyRpgEngineState([]);
const processedActionKeys = new Set<string>();
let matchSettled = false;
let lastRoundScored = -1;
let aiGateway: AiGateway | null = null;
let pendingAssetEpoch = 0;
let pendingEnrichmentEpoch = 0;
let pendingJudgeEpoch = 0;

function getAiGateway(): AiGateway | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    return null;
  }

  const envModel = process.env.OPENROUTER_MODEL;
  const model =
    envModel !== undefined && envModel.trim() !== ""
      ? envModel.trim()
      : "openai/gpt-4o-mini";

  const referer = process.env.OPENROUTER_HTTP_REFERER;

  const config: AiGatewayConfig = {
    apiKey,
    chatModel: model,
    title: "Game Hub Party RPG",
  };
  if (referer !== undefined && referer !== "") {
    config.referer = referer;
  }

  return createAiGateway(config);
}

function applyEngineState(
  api: GameHostApi<PartyRpgState>,
  next: PartyRpgEngineState,
): void {
  runtimeState = next;
  api.setState(next.publicState);
}

function buildContext(nowMs: number) {
  return { nowMs, situations: situ };
}

function maybeStartAssetJobs(api: GameHostApi<PartyRpgState>): void {
  if (runtimeState.publicState.stage !== "asset_generation") {
    return;
  }
  if (runtimeState.assetJobStarted) {
    return;
  }

  runtimeState = { ...runtimeState, assetJobStarted: true };
  const epoch = (pendingAssetEpoch += 1);

  void runAssetJobs(api, epoch);
}

async function runAssetJobs(
  api: GameHostApi<PartyRpgState>,
  epoch: number,
): Promise<void> {
  const gateway = getAiGateway();
  const players = api.getPlayers().filter((player) => player.role === "player");

  const nextChars = [...runtimeState.publicState.characters];

  for (const player of players) {
    if (epoch !== pendingAssetEpoch) {
      return;
    }

    const draft = runtimeState.characterDraftByPlayer[player.playerId];
    const index = nextChars.findIndex((character) => character.playerId === player.playerId);

    if (draft === undefined || index < 0) {
      continue;
    }

    if (gateway === null) {
      nextChars[index] = {
        ...nextChars[index]!,
        assetStatus: "ready",
        summaryShort: buildLocalSummary(draft),
      };
      continue;
    }

    try {
      const extras = buildAiCharacterSummaryExtras(draft);
      const summaryParams: Parameters<AiGateway["generateCharacterSummary"]>[0] =
        {
          background: buildCharacterNarrativeBackground(draft),
          name: draft.chosenName.trim(),
          slogan: draft.chosenSlogan.trim(),
        };
      if (extras.archetype !== undefined) {
        summaryParams.archetype = extras.archetype;
      }
      if (extras.funFact !== undefined) {
        summaryParams.funFact = extras.funFact;
      }
      if (extras.motto !== undefined) {
        summaryParams.motto = extras.motto;
      }
      if (extras.weakness !== undefined) {
        summaryParams.weakness = extras.weakness;
      }

      const summary = await gateway.generateCharacterSummary(summaryParams);

      if (epoch !== pendingAssetEpoch) {
        return;
      }

      nextChars[index] = {
        ...nextChars[index]!,
        assetStatus: "ready",
        summaryShort: summary.summaryShort.slice(0, 240),
      };
    } catch {
      if (epoch !== pendingAssetEpoch) {
        return;
      }
      nextChars[index] = {
        ...nextChars[index]!,
        assetStatus: "error",
        summaryShort: buildLocalSummary(draft),
      };
    }
  }

  if (epoch !== pendingAssetEpoch) {
    return;
  }

  if (runtimeState.publicState.stage !== "asset_generation") {
    return;
  }

  applyEngineState(
    api,
    reducePartyRpgEngineState(
      runtimeState,
      {
        characters: nextChars,
        players: api.getPlayers(),
        type: "assets_ready",
      },
      buildContext(Date.now()),
    ),
  );
  publishPartyHubState(api);
  maybeStartEnrichmentJobs(api); // no-op if not llm stage
}

function buildLocalSummary(draft: PartyRpgCharacterDraft): string {
  const preview = buildCharacterSummaryPreview(draft).trim();
  if (preview !== "") {
    return preview.slice(0, 240);
  }
  const name = draft.chosenName.trim();
  const slogan = draft.chosenSlogan.trim();
  return `${name}: „${slogan}”`.slice(0, 240);
}

function maybeStartEnrichmentJobs(api: GameHostApi<PartyRpgState>): void {
  if (runtimeState.publicState.stage !== "llm_enrichment") {
    return;
  }
  if (runtimeState.enrichmentResolved) {
    return;
  }
  if (runtimeState.enrichmentStarted) {
    return;
  }

  runtimeState = { ...runtimeState, enrichmentStarted: true };
  const epoch = (pendingEnrichmentEpoch += 1);
  void runEnrichmentJobs(api, epoch);
}

async function runEnrichmentJobs(
  api: GameHostApi<PartyRpgState>,
  epoch: number,
): Promise<void> {
  const gateway = getAiGateway();
  const players = api.getPlayers();
  const situation = runtimeState.publicState.currentSituation;

  if (situation === null) {
    return;
  }

  const eligible = players
    .filter((player) => player.role === "player" && player.connected)
    .sort((left, right) => left.playerId.localeCompare(right.playerId));

  const entries: Array<{
    audioCueText: string | null;
    judgeComment: null;
    narrationText: string;
    playerId: string;
  }> = [];

  for (const player of eligible) {
    if (epoch !== pendingEnrichmentEpoch) {
      return;
    }

    const answer = runtimeState.privateAnswers[player.playerId] ?? "";
    const character = runtimeState.publicState.characters.find(
      (entry) => entry.playerId === player.playerId,
    );
    const summary =
      character?.summaryShort?.trim() !== ""
        ? character!.summaryShort
        : player.name;

    if (gateway === null) {
      const safe =
        answer.length > 180 ? `${answer.slice(0, 177).trimEnd()}…` : answer;
      entries.push({
        audioCueText: null,
        judgeComment: null,
        narrationText: `${player.name} sagt leise: „${safe}”`,
        playerId: player.playerId,
      });
      continue;
    }

    try {
      const narration = await gateway.generateNarration({
        answerText: answer,
        characterSummary: summary,
        situationPrompt: situation.prompt,
      });
      if (epoch !== pendingEnrichmentEpoch) {
        return;
      }
      entries.push({
        audioCueText: narration.audioCueText ?? null,
        judgeComment: null,
        narrationText: narration.narrationText.slice(0, 380),
        playerId: player.playerId,
      });
    } catch {
      if (epoch !== pendingEnrichmentEpoch) {
        return;
      }
      const safe =
        answer.length > 180 ? `${answer.slice(0, 177).trimEnd()}…` : answer;
      entries.push({
        audioCueText: null,
        judgeComment: null,
        narrationText: `${player.name} bleibt dramatisch: „${safe}”`,
        playerId: player.playerId,
      });
    }
  }

  if (epoch !== pendingEnrichmentEpoch) {
    return;
  }

  if (
    runtimeState.publicState.stage !== "llm_enrichment" ||
    runtimeState.enrichmentResolved === true
  ) {
    return;
  }

  applyEngineState(
    api,
    reducePartyRpgEngineState(
      runtimeState,
      {
        entries,
        players,
        type: "enrichment_ready",
      },
      buildContext(Date.now()),
    ),
  );
  publishPartyHubState(api);
}

function maybeStartJudgeJob(api: GameHostApi<PartyRpgState>): void {
  if (runtimeState.publicState.stage !== "judge_deliberation") {
    return;
  }
  if (runtimeState.judgeResolved || runtimeState.judgeStarted) {
    return;
  }

  runtimeState = { ...runtimeState, judgeStarted: true };
  const epoch = (pendingJudgeEpoch += 1);
  void runJudgeJob(api, epoch);
}

async function runJudgeJob(
  api: GameHostApi<PartyRpgState>,
  epoch: number,
): Promise<void> {
  const gateway = getAiGateway();
  const players = api.getPlayers();
  const situation = runtimeState.publicState.currentSituation;
  const showcase = runtimeState.publicState.showcaseEntries;

  if (situation === null || showcase.length === 0) {
    applyEngineState(
      api,
      reducePartyRpgEngineState(
        runtimeState,
        {
          commentsByPlayerId: {},
          players,
          type: "judge_completed",
          winnerId: pickFallbackWinner(players, showcase),
        },
        buildContext(Date.now()),
      ),
    );
    syncAfterRoundIfNeeded(api);
    publishPartyHubState(api);
    return;
  }

  if (gateway === null) {
    applyEngineState(
      api,
      reducePartyRpgEngineState(
        runtimeState,
        {
          commentsByPlayerId: buildHeuristicComments(showcase),
          players,
          type: "judge_completed",
          winnerId: pickFallbackWinner(players, showcase),
        },
        buildContext(Date.now()),
      ),
    );
    syncAfterRoundIfNeeded(api);
    publishPartyHubState(api);
    return;
  }

  try {
    const judge = await gateway.judgeRound({
      entries: showcase.map((entry) => ({
        narrationText: entry.narrationText,
        playerId: entry.playerId,
        playerName:
          players.find((player) => player.playerId === entry.playerId)?.name ??
          entry.playerId,
      })),
      situationPrompt: situation.prompt,
    });

    if (epoch !== pendingJudgeEpoch) {
      return;
    }

    const valid = new Set(
      players
        .filter((player) => player.role === "player")
        .map((player) => player.playerId),
    );
    const winnerId = valid.has(judge.winnerPlayerId)
      ? judge.winnerPlayerId
      : pickFallbackWinner(players, showcase);

    applyEngineState(
      api,
      reducePartyRpgEngineState(
        runtimeState,
        {
          commentsByPlayerId: judge.commentsByPlayerId,
          players,
          type: "judge_completed",
          winnerId,
        },
        buildContext(Date.now()),
      ),
    );
  } catch {
    if (epoch !== pendingJudgeEpoch) {
      return;
    }
    applyEngineState(
      api,
      reducePartyRpgEngineState(
        runtimeState,
        {
          commentsByPlayerId: buildHeuristicComments(showcase),
          players,
          type: "judge_completed",
          winnerId: pickFallbackWinner(players, showcase),
        },
        buildContext(Date.now()),
      ),
    );
  }

  syncAfterRoundIfNeeded(api);
  publishPartyHubState(api);
}

function pickFallbackWinner(
  players: GamePlayerSnapshot[],
  showcase: PartyRpgState["showcaseEntries"],
): string {
  const eligible = players.filter((player) => player.role === "player");
  if (eligible.length > 0 && showcase[0] !== undefined) {
    const seed = showcase[0]!.playerId;
    const exists = eligible.some((player) => player.playerId === seed);
    if (exists) {
      return seed;
    }
    const first = eligible[0];
    return first!.playerId;
  }
  return showcase[0]?.playerId ?? "unknown";
}

function buildHeuristicComments(
  showcase: PartyRpgState["showcaseEntries"],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of showcase) {
    out[entry.playerId] =
      entry.narrationText.length > 120
        ? `${entry.narrationText.slice(0, 117)}…`
        : "Solider Auftritt.";
  }
  return out;
}

function afterRoundScoring(api: GameHostApi<PartyRpgState>): void {
  const winner = runtimeState.publicState.roundWinnerId;
  const idx = runtimeState.publicState.roundIndex;
  if (winner === null || idx === lastRoundScored) {
    return;
  }

  lastRoundScored = idx;
  api.results.recordPlayerWin(winner);
  api.results.awardPlayerPoints(winner, PARTY_POINTS_ROUND_WIN);
  api.results.endRound({
    message: `+${String(PARTY_POINTS_ROUND_WIN)} Punkte fuer die Runde.`,
    title: "Party-RPG Runde",
  });
}

function syncAfterRoundIfNeeded(api: GameHostApi<PartyRpgState>): void {
  if (runtimeState.publicState.stage === "round_result") {
    afterRoundScoring(api);
  }
}

function settleMatch(api: GameHostApi<PartyRpgState>): void {
  if (!runtimeState.publicState.matchComplete || matchSettled) {
    return;
  }

  matchSettled = true;
  const players = api.getPlayers();
  const ordered = [...players]
    .filter((player) => player.role === "player")
    .map((player) => ({
      player,
      score:
        api.session.getLeaderboard().find(
          (entry) => entry.playerId === player.playerId,
        )?.score ?? 0,
    }))
    .sort((left, right) => right.score - left.score);

  ordered.forEach((entry, index) => {
    api.results.recordPlacement(entry.player.playerId, index + 1);
  });

  api.results.endMatch({
    message: runtimeState.publicState.latestMessage,
    title: "Party RPG Ende",
  });
}

function publishPartyHubState(api: GameHostApi<PartyRpgState>): void {
  api.ui.publishStatusBadges([
    {
      id: "party-stage",
      label: "Stage",
      tone: "neutral",
      value: runtimeState.publicState.stage,
    },
    {
      id: "party-round",
      label: "Runde",
      tone: "neutral",
      value: `${String(runtimeState.publicState.roundIndex)}/${String(runtimeState.publicState.roundCount)}`,
    },
  ]);

  for (const row of runtimeState.publicState.playerRows) {
    const ready = row.characterReady ? "ready" : "drafting";
    const answered = row.submittedAnswer ? "answered" : "waiting";
    api.results.setPlayerStatus(
      row.playerId,
      runtimeState.publicState.stage === "answer_collection" ? answered : ready,
    );
  }
}

function rememberIdempotencyKey(
  playerId: string,
  action: string,
  clientRequestId: string | undefined,
): boolean {
  if (clientRequestId === undefined || clientRequestId.trim() === "") {
    return true;
  }

  const key = `${playerId}:${action}:${clientRequestId}`;
  if (processedActionKeys.has(key)) {
    return false;
  }

  processedActionKeys.add(key);
  if (processedActionKeys.size > 500) {
    processedActionKeys.clear();
  }

  return true;
}

function isHostOrModerator(
  api: GameHostApi<PartyRpgState>,
  playerId: string,
): boolean {
  if (playerId === "host_local") {
    return true;
  }

  return api.getSnapshot().moderatorId === playerId;
}

function parseSubmitCharacterPayload(
  message: InputMessage,
): {
  clientRequestId?: string;
  confirmReady?: boolean;
  draft: PartyRpgCharacterDraft;
} | undefined {
  if (message.value === undefined) {
    return undefined;
  }

  if (typeof message.value !== "object" || message.value === null) {
    return undefined;
  }

  const record = message.value as Record<string, unknown>;
  const draft = parseCharacterDraftPayload(record);
  if (draft === null) {
    return undefined;
  }

  const confirmReady = record.confirmReady === true;
  const base = confirmReady ? { confirmReady: true as const, draft } : { draft };

  if (typeof record.clientRequestId === "string") {
    return { ...base, clientRequestId: record.clientRequestId };
  }

  return base;
}

function parseAnswerPayload(message: InputMessage):
  | { answerText: string; clientRequestId?: string }
  | undefined {
  if (typeof message.value === "string") {
    return { answerText: message.value };
  }

  if (
    typeof message.value === "object" &&
    message.value !== null &&
    typeof (message.value as { text?: unknown }).text === "string"
  ) {
    const record = message.value as { clientRequestId?: unknown; text: string };
    if (typeof record.clientRequestId === "string") {
      return { answerText: record.text, clientRequestId: record.clientRequestId };
    }
    return { answerText: record.text };
  }

  return undefined;
}

export const gamePlugin = createGamePlugin<PartyRpgState, unknown>({
  central: PartyCentralView,
  createInitialState() {
    return createInitialPartyRpgEngineState([]).publicState;
  },
  manifest: {
    description:
      "DnD-inspiriertes Partyspiel mit Charakteren, privaten Antworten, AI-Show und Judge.",
    displayName: "Party RPG",
    id: "party-rpg",
    minPlayers: 2,
    rankingMode: "score",
    roundsMode: "rounds",
    supportsTeams: false,
    tickHz: 1,
    version: "0.1.0",
  },
  mobile: PartyMobileView,
  parseInput(message) {
    return message.value;
  },
  server: {
    onGameStart(api) {
      aiGateway = getAiGateway();
      matchSettled = false;
      lastRoundScored = -1;
      processedActionKeys.clear();
      pendingAssetEpoch += 1;
      pendingEnrichmentEpoch += 1;
      pendingJudgeEpoch += 1;
      applyEngineState(
        api,
        reducePartyRpgEngineState(
          runtimeState,
          {
            players: api.getPlayers(),
            seed: api.getSnapshot().updatedAt,
            type: "game_started",
          },
          buildContext(Date.now()),
        ),
      );
      api.results.clearLeaderboard();
      publishPartyHubState(api);
      api.log("info", "party_rpg_started", "Party RPG match started.", {
        aiConfigured: aiGateway !== null,
      });
      maybeStartAssetJobs(api);
      maybeStartEnrichmentJobs(api);
    },
    onGameStop(api) {
      pendingAssetEpoch += 1;
      pendingEnrichmentEpoch += 1;
      pendingJudgeEpoch += 1;
      applyEngineState(
        api,
        reducePartyRpgEngineState(
          runtimeState,
          { players: api.getPlayers(), type: "game_stopped" },
          buildContext(Date.now()),
        ),
      );
      publishPartyHubState(api);
    },
    onInput(api, input) {
      const now = Date.now();

      if (input.action === PARTY_SUBMIT_CHARACTER) {
        const parsed = parseSubmitCharacterPayload(input.raw);
        if (parsed === undefined) {
          return;
        }

        if (!rememberIdempotencyKey(input.playerId, input.action, parsed.clientRequestId)) {
          return;
        }

        const player = api.getPlayers().find(
          (entry) => entry.playerId === input.playerId,
        );
        if (player === undefined || player.role !== "player") {
          return;
        }

        applyEngineState(
          api,
          reducePartyRpgEngineState(
            runtimeState,
            {
              draft: parsed.draft,
              playerId: input.playerId,
              players: api.getPlayers(),
              type: "character_submitted",
            },
            buildContext(now),
          ),
        );
        publishPartyHubState(api);
        maybeStartAssetJobs(api);

        if (parsed.confirmReady === true) {
          applyEngineState(
            api,
            reducePartyRpgEngineState(
              runtimeState,
              {
                playerId: input.playerId,
                players: api.getPlayers(),
                type: "character_ready",
              },
              buildContext(now),
            ),
          );
          publishPartyHubState(api);
          maybeStartAssetJobs(api);
        }
        return;
      }

      if (input.action === PARTY_CONFIRM_READY) {
        const player = api.getPlayers().find(
          (entry) => entry.playerId === input.playerId,
        );
        if (player === undefined || player.role !== "player") {
          return;
        }

        applyEngineState(
          api,
          reducePartyRpgEngineState(
            runtimeState,
            {
              playerId: input.playerId,
              players: api.getPlayers(),
              type: "character_ready",
            },
            buildContext(now),
          ),
        );
        publishPartyHubState(api);
        maybeStartAssetJobs(api);
        return;
      }

      if (input.action === PARTY_SUBMIT_ANSWER) {
        const parsed = parseAnswerPayload(input.raw);
        if (parsed === undefined) {
          return;
        }

        if (!rememberIdempotencyKey(input.playerId, input.action, parsed.clientRequestId)) {
          return;
        }

        const player = api.getPlayers().find(
          (entry) => entry.playerId === input.playerId,
        );
        if (player === undefined || player.role !== "player") {
          return;
        }

        applyEngineState(
          api,
          reducePartyRpgEngineState(
            runtimeState,
            {
              answerText: parsed.answerText,
              playerId: input.playerId,
              players: api.getPlayers(),
              type: "answer_submitted",
            },
            buildContext(now),
          ),
        );
        publishPartyHubState(api);
        maybeStartEnrichmentJobs(api);
        return;
      }

      if (input.action === PARTY_CONTINUE_ROUND) {
        if (!isHostOrModerator(api, input.playerId)) {
          return;
        }

        applyEngineState(
          api,
          reducePartyRpgEngineState(
            runtimeState,
            { players: api.getPlayers(), type: "continue_round" },
            buildContext(now),
          ),
        );
        publishPartyHubState(api);
        if (
          runtimeState.publicState.stage === "match_result" &&
          runtimeState.publicState.matchComplete
        ) {
          settleMatch(api);
        }
        return;
      }

      if (input.action === PARTY_RESTART) {
        if (input.playerId !== "host_local") {
          return;
        }

        matchSettled = false;
        lastRoundScored = -1;
        processedActionKeys.clear();
        pendingAssetEpoch += 1;
        pendingEnrichmentEpoch += 1;
        pendingJudgeEpoch += 1;
        applyEngineState(
          api,
          reducePartyRpgEngineState(
            runtimeState,
            {
              players: api.getPlayers(),
              seed: now,
              type: "restart_requested",
            },
            buildContext(now),
          ),
        );
        api.results.clearLeaderboard();
        publishPartyHubState(api);
        maybeStartAssetJobs(api);
        return;
      }

      if (input.action === PARTY_HOST_SKIP_INTRO) {
        if (input.playerId !== "host_local") {
          return;
        }

        applyEngineState(
          api,
          reducePartyRpgEngineState(
            runtimeState,
            { players: api.getPlayers(), type: "skip_intro" },
            buildContext(now),
          ),
        );
        publishPartyHubState(api);
        return;
      }

      if (input.action === PARTY_HOST_NEXT_REVEAL) {
        if (input.playerId !== "host_local") {
          return;
        }

        applyEngineState(
          api,
          reducePartyRpgEngineState(
            runtimeState,
            { players: api.getPlayers(), type: "next_reveal" },
            buildContext(now),
          ),
        );
        publishPartyHubState(api);
        maybeStartJudgeJob(api);
        return;
      }
    },
    onPlayerJoin(api) {
      applyEngineState(
        api,
        reducePartyRpgEngineState(
          runtimeState,
          { players: api.getPlayers(), type: "session_synced" },
          buildContext(Date.now()),
        ),
      );
      publishPartyHubState(api);
      maybeStartAssetJobs(api);
      maybeStartEnrichmentJobs(api);
    },
    onPlayerLeave(api) {
      applyEngineState(
        api,
        reducePartyRpgEngineState(
          runtimeState,
          { players: api.getPlayers(), type: "session_synced" },
          buildContext(Date.now()),
        ),
      );
      publishPartyHubState(api);
    },
    onPlayerReconnect(api) {
      applyEngineState(
        api,
        reducePartyRpgEngineState(
          runtimeState,
          { players: api.getPlayers(), type: "session_synced" },
          buildContext(Date.now()),
        ),
      );
      publishPartyHubState(api);
    },
    onSessionCreated(api) {
      aiGateway = getAiGateway();
      matchSettled = false;
      lastRoundScored = -1;
      processedActionKeys.clear();
      runtimeState = createInitialPartyRpgEngineState(api.getPlayers());
      applyEngineState(api, runtimeState);
      api.results.clearLeaderboard();
      publishPartyHubState(api);
      api.log("info", "party_rpg_session_attached", "Party RPG plugin bereit.", {
        aiConfigured: aiGateway !== null,
      });
    },
    onTick(api) {
      const before = runtimeState.publicState.stage;
      applyEngineState(
        api,
        reducePartyRpgEngineState(
          runtimeState,
          { players: api.getPlayers(), type: "tick" },
          buildContext(Date.now()),
        ),
      );

      if (before !== runtimeState.publicState.stage) {
        publishPartyHubState(api);
      }

      maybeStartAssetJobs(api);
      maybeStartEnrichmentJobs(api);
      maybeStartJudgeJob(api);
      syncAfterRoundIfNeeded(api);
    },
  },
});

export const manifest = gamePlugin.manifest;
export default gamePlugin;
