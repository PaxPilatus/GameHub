import type { InputMessage } from "@game-hub/protocol";
import {
  createAiGateway,
  createStaleGuard,
  type AiGateway,
  type AiGatewayConfig,
  type NarrationScript,
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
  isPartyRpgParticipantRole,
  parseCharacterDraftPayload,
  reducePartyRpgEngineState,
} from "./reducer.js";
import {
  computeFallbackMechanicsResolution,
  computeMechanicsResolution,
  type MechanicsResolution,
} from "./mechanics.js";
import { createLimitedParallelQueue } from "./runtime/job-queue.js";
import {
  buildFallbackNarrationScript,
  mechanicsToJson,
  roundContextToJson,
  showcaseEntryFromNarrationScript,
  styleProfileToJson,
} from "./runtime/narration-pipeline.js";
import { renderTtsStubForScript, type TtsRenderResult } from "./runtime/tts-pipeline.js";
import { buildCharacterStyleProfile } from "./style-profile.js";
import situations from "./situations.json" with { type: "json" };
import { PARTY_RPG_TEST_SITUATION_ID } from "./test-assets.js";

const situ: PartyRpgSituation[] = situations as PartyRpgSituation[];

function isTestFlow(): boolean {
  const v = process.env.PARTY_RPG_TEST_FLOW;
  return v === "1" || v === "true";
}

function buildSituationsForContext(): PartyRpgSituation[] {
  if (!isTestFlow()) {
    return situ;
  }
  const test = situ.find((s) => s.id === PARTY_RPG_TEST_SITUATION_ID);
  return test !== undefined ? [test] : situ;
}

let runtimeState = createInitialPartyRpgEngineState([]);
const processedActionKeys = new Set<string>();
let matchSettled = false;
let lastRoundScored = -1;
let aiGateway: AiGateway | null = null;
let pendingAssetEpoch = 0;
let pendingJudgeEpoch = 0;

const narrationQueue = createLimitedParallelQueue(3);
const ttsQueue = createLimitedParallelQueue(3);

let pipelineSessionEpoch = 0;
const mechanicsCache = new Map<string, MechanicsResolution>();
const narrationScriptCache = new Map<string, NarrationScript>();
const ttsManifestCache = new Map<string, TtsRenderResult>();
const narrationScheduledKeys = new Set<string>();
let judgeKickoffDoneForRound = false;

type JudgeEarlyResult = {
  commentsByPlayerId: Record<string, string>;
  pipelineSessionEpoch: number;
  roundIndex: number;
  winnerPlayerId: string;
};

let judgeEarlyResult: JudgeEarlyResult | null = null;

function pipelineKey(roundIndex: number, playerId: string): string {
  return `${String(roundIndex)}:${playerId}`;
}

function bumpPipelineSessionEpoch(): void {
  pipelineSessionEpoch += 1;
  mechanicsCache.clear();
  narrationScriptCache.clear();
  ttsManifestCache.clear();
  narrationScheduledKeys.clear();
  judgeEarlyResult = null;
  judgeKickoffDoneForRound = false;
  narrationQueue.invalidateQueued(() => true);
  ttsQueue.invalidateQueued(() => true);
}

function clearPipelineForNewRound(): void {
  mechanicsCache.clear();
  narrationScriptCache.clear();
  ttsManifestCache.clear();
  narrationScheduledKeys.clear();
  judgeEarlyResult = null;
  judgeKickoffDoneForRound = false;
  narrationQueue.invalidateQueued(() => true);
  ttsQueue.invalidateQueued(() => true);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
  const prevRound = runtimeState.publicState.roundIndex;
  runtimeState = next;
  api.setState(next.publicState);
  if (next.publicState.roundIndex !== prevRound) {
    clearPipelineForNewRound();
  }
}

function buildContext(nowMs: number) {
  return { nowMs, situations: buildSituationsForContext() };
}

function submitRoundAnswerFromHost(
  api: GameHostApi<PartyRpgState>,
  playerId: string,
  answerText: string,
): void {
  const now = Date.now();
  applyEngineState(
    api,
    reducePartyRpgEngineState(
      runtimeState,
      {
        answerText,
        playerId,
        players: api.getPlayers(),
        type: "answer_submitted",
      },
      buildContext(now),
    ),
  );
  publishPartyHubState(api);
  scheduleNarrationForPlayer(api, playerId);
  maybeStartEnrichmentJobs(api);
}

function maybeInjectTestAnswers(api: GameHostApi<PartyRpgState>): void {
  if (!isTestFlow()) {
    return;
  }
  if (runtimeState.publicState.stage !== "answer_collection") {
    return;
  }
  const eligible = listRoundPlayersSnapshot(api.getPlayers());
  for (let i = 0; i < eligible.length; i += 1) {
    const player = eligible[i];
    if (player === undefined) {
      continue;
    }
    if (runtimeState.privateAnswers[player.playerId] !== undefined) {
      continue;
    }
    const row = runtimeState.publicState.playerRows.find(
      (r) => r.playerId === player.playerId,
    );
    if (row?.submittedAnswer === true) {
      continue;
    }
    const answerText =
      i === 0
        ? "Test-Antwort A: Ich werfe Mehl als Nebelgranate."
        : i === 1
          ? "Test-Antwort B: Ich spiele den Wellerman auf dem Bierfass."
          : `Test-Antwort ${String(i + 1)} (automatisch).`;
    submitRoundAnswerFromHost(api, player.playerId, answerText);
  }
}

function buildTestFlowJudgeComments(
  showcase: PartyRpgState["showcaseEntries"],
): Record<string, string> {
  const out: Record<string, string> = {};
  showcase.forEach((entry, index) => {
    out[entry.playerId] =
      index === 0
        ? "Test-Judge: Variante A ist absurd genug."
        : "Test-Judge: Variante B hat Tempo.";
  });
  return out;
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
  const players = api
    .getPlayers()
    .filter((player) => isPartyRpgParticipantRole(player.role));

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

/**
 * Alle Spieler dieser Runde laut `playerRows` (unabhängig von `connected`).
 * Namen kommen aus dem Snapshot; fehlende Einträge (z. B. kurz getrennt) nutzen playerId als Label.
 */
function listRoundPlayersSnapshot(
  players: GamePlayerSnapshot[],
): GamePlayerSnapshot[] {
  const byId = new Map(
    players
      .filter((player) => isPartyRpgParticipantRole(player.role))
      .map((player) => [player.playerId, player] as const),
  );
  return [...runtimeState.publicState.playerRows]
    .map((row) => {
      const snap = byId.get(row.playerId);
      if (snap !== undefined) {
        return snap;
      }
      return {
        connected: false,
        lastSeen: 0,
        name: row.playerId,
        playerId: row.playerId,
        role: "player" as const,
        team: "A" as const,
      } satisfies GamePlayerSnapshot;
    })
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
}

function getOrComputeMechanics(
  playerId: string,
  answerText: string,
): MechanicsResolution {
  const roundIndex = runtimeState.publicState.roundIndex;
  const key = pipelineKey(roundIndex, playerId);
  const existing = mechanicsCache.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const draft = runtimeState.characterDraftByPlayer[playerId];
  const situation = runtimeState.publicState.currentSituation;
  const tags = situation?.tags ?? [];
  const mech =
    draft !== undefined
      ? computeMechanicsResolution({
          answerText,
          draft,
          playerId,
          roundIndex,
          sessionSeed: runtimeState.publicState.sessionSeed,
          situationTags: tags,
        })
      : computeFallbackMechanicsResolution({
          answerText,
          playerId,
          roundIndex,
          sessionSeed: runtimeState.publicState.sessionSeed,
        });
  mechanicsCache.set(key, mech);
  return mech;
}

function scheduleNarrationForPlayer(
  api: GameHostApi<PartyRpgState>,
  playerId: string,
): void {
  const stage = runtimeState.publicState.stage;
  if (stage !== "answer_collection" && stage !== "llm_enrichment") {
    return;
  }
  const answer = runtimeState.privateAnswers[playerId];
  if (answer === undefined || answer.trim() === "") {
    return;
  }
  const roundIndex = runtimeState.publicState.roundIndex;
  const key = pipelineKey(roundIndex, playerId);
  if (narrationScriptCache.has(key) || narrationScheduledKeys.has(key)) {
    return;
  }
  narrationScheduledKeys.add(key);

  applyEngineState(
    api,
    reducePartyRpgEngineState(
      runtimeState,
      {
        playerId,
        players: api.getPlayers(),
        status: "queued",
        type: "pipeline_narration_status",
      },
      buildContext(Date.now()),
    ),
  );

  const sessionEp = pipelineSessionEpoch;
  const roundAtSchedule = roundIndex;

  narrationQueue.enqueue({
    id: `narr:${String(roundAtSchedule)}:${playerId}`,
    isValid: () =>
      sessionEp === pipelineSessionEpoch &&
      runtimeState.publicState.roundIndex === roundAtSchedule &&
      (runtimeState.publicState.stage === "answer_collection" ||
        runtimeState.publicState.stage === "llm_enrichment"),
    run: async () => {
      await runSingleNarrationJob(api, playerId, sessionEp, roundAtSchedule, key, answer);
    },
  });
}

async function runSingleNarrationJob(
  api: GameHostApi<PartyRpgState>,
  playerId: string,
  sessionEp: number,
  roundAtSchedule: number,
  cacheKey: string,
  answer: string,
): Promise<void> {
  if (sessionEp !== pipelineSessionEpoch) {
    return;
  }

  applyEngineState(
    api,
    reducePartyRpgEngineState(
      runtimeState,
      {
        playerId,
        players: api.getPlayers(),
        status: "running",
        type: "pipeline_narration_status",
      },
      buildContext(Date.now()),
    ),
  );

  const gateway = getAiGateway();
  const situation = runtimeState.publicState.currentSituation;
  const player = api.getPlayers().find((entry) => entry.playerId === playerId);
  const draft = runtimeState.characterDraftByPlayer[playerId];
  const character = runtimeState.publicState.characters.find(
    (entry) => entry.playerId === playerId,
  );
  const playerName = player?.name ?? playerId;
  const mech = getOrComputeMechanics(playerId, answer);
  const sessionId = String(runtimeState.publicState.sessionSeed);
  const style = draft !== undefined ? buildCharacterStyleProfile(draft) : buildCharacterStyleProfile({
    backgroundId: null,
    chosenName: playerName,
    chosenSlogan: character?.slogan ?? "",
    classId: null,
    flawId: null,
    jobId: null,
    quirkId: null,
    raceId: null,
    signatureObjectId: null,
    startItemId: null,
    voiceProfileId: character?.voiceProfileId ?? null,
  });

  let script: NarrationScript = buildFallbackNarrationScript({
    answerText: answer,
    mechanics: mech,
    playerId,
    playerName,
    roundIndex: roundAtSchedule,
    sessionId,
  });

  if (gateway !== null && situation !== null) {
    const mechanicsJson = mechanicsToJson({
      mechanics: mech,
      playerId,
      roundIndex: roundAtSchedule,
      sessionId,
    });
    try {
      const llmScript = await gateway.generateNarrationScript({
        answerText: answer,
        characterStyleJson: styleProfileToJson(style),
        mechanicsJson,
        playerId,
        roundContextJson: roundContextToJson({
          situationId: situation.id,
          situationPrompt: situation.prompt,
          situationTags: situation.tags,
          situationTitle: situation.title,
        }),
        roundIndex: roundAtSchedule,
        sessionId,
        stale: createStaleGuard(() => pipelineSessionEpoch),
      });
      if (llmScript.playerId !== playerId || llmScript.roundIndex !== roundAtSchedule) {
        throw new Error("narration_script_mismatch");
      }
      script = {
        ...llmScript,
        outcome: mech.outcome,
        playerId,
        roundIndex: roundAtSchedule,
        rollSummary: mech.rollSummary,
        sessionId,
      };
    } catch (firstErr) {
      if (
        firstErr instanceof Error &&
        firstErr.message === "ai_stale_guard"
      ) {
        return;
      }
      try {
        await sleep(320);
        const repaired = await gateway.repairNarrationScript({
          brokenJsonText: String(firstErr),
          mechanicsJson,
          stale: createStaleGuard(() => pipelineSessionEpoch),
        });
        if (
          repaired.playerId !== playerId ||
          repaired.roundIndex !== roundAtSchedule
        ) {
          script = buildFallbackNarrationScript({
            answerText: answer,
            mechanics: mech,
            playerId,
            playerName,
            roundIndex: roundAtSchedule,
            sessionId,
          });
        } else {
          script = {
            ...repaired,
            outcome: mech.outcome,
            playerId,
            roundIndex: roundAtSchedule,
            rollSummary: mech.rollSummary,
            sessionId,
          };
        }
      } catch {
        await sleep(800);
        script = buildFallbackNarrationScript({
          answerText: answer,
          mechanics: mech,
          playerId,
          playerName,
          roundIndex: roundAtSchedule,
          sessionId,
        });
      }
    }
  }

  if (sessionEp !== pipelineSessionEpoch || runtimeState.publicState.roundIndex !== roundAtSchedule) {
    return;
  }

  narrationScriptCache.set(cacheKey, script);

  applyEngineState(
    api,
    reducePartyRpgEngineState(
      runtimeState,
      {
        playerId,
        players: api.getPlayers(),
        status: "completed",
        type: "pipeline_narration_status",
      },
      buildContext(Date.now()),
    ),
  );

  scheduleTtsForPlayer(api, playerId, script, sessionEp, roundAtSchedule, cacheKey);
  tryCompleteEnrichmentPhase(api);
}

function scheduleTtsForPlayer(
  api: GameHostApi<PartyRpgState>,
  playerId: string,
  script: NarrationScript,
  sessionEp: number,
  roundAtSchedule: number,
  cacheKey: string,
): void {
  const character = runtimeState.publicState.characters.find(
    (entry) => entry.playerId === playerId,
  );
  const playerVoice = character?.voiceProfileId ?? "player_voice_a";

  applyEngineState(
    api,
    reducePartyRpgEngineState(
      runtimeState,
      {
        playerId,
        players: api.getPlayers(),
        status: "queued",
        type: "pipeline_tts_status",
      },
      buildContext(Date.now()),
    ),
  );

  ttsQueue.enqueue({
    id: `tts:${String(roundAtSchedule)}:${playerId}`,
    isValid: () =>
      sessionEp === pipelineSessionEpoch &&
      runtimeState.publicState.roundIndex === roundAtSchedule,
    run: async () => {
      if (sessionEp !== pipelineSessionEpoch) {
        return;
      }
      applyEngineState(
        api,
        reducePartyRpgEngineState(
          runtimeState,
          {
            playerId,
            players: api.getPlayers(),
            status: "running",
            type: "pipeline_tts_status",
          },
          buildContext(Date.now()),
        ),
      );
      try {
        const manifest = await renderTtsStubForScript({
          narrationScript: script,
          playerVoiceProfileId: playerVoice,
          roundIndex: roundAtSchedule,
        });
        if (sessionEp !== pipelineSessionEpoch || runtimeState.publicState.roundIndex !== roundAtSchedule) {
          return;
        }
        ttsManifestCache.set(cacheKey, manifest);
        applyEngineState(
          api,
          reducePartyRpgEngineState(
            runtimeState,
            {
              playerId,
              players: api.getPlayers(),
              status: "completed",
              type: "pipeline_tts_status",
            },
            buildContext(Date.now()),
          ),
        );
        if (runtimeState.publicState.stage === "showcase") {
          applyEngineState(
            api,
            reducePartyRpgEngineState(
              runtimeState,
              {
                playerId,
                players: api.getPlayers(),
                type: "showcase_tts_ready",
              },
              buildContext(Date.now()),
            ),
          );
        }
      } catch {
        applyEngineState(
          api,
          reducePartyRpgEngineState(
            runtimeState,
            {
              playerId,
              players: api.getPlayers(),
              status: "failed",
              type: "pipeline_tts_status",
            },
            buildContext(Date.now()),
          ),
        );
      }
    },
  });
}

function buildShowcaseEntriesFromCaches(
  players: GamePlayerSnapshot[],
): PartyRpgState["showcaseEntries"] {
  const eligible = listRoundPlayersSnapshot(players);
  const roundIndex = runtimeState.publicState.roundIndex;
  return eligible.map((player) => {
    const key = pipelineKey(roundIndex, player.playerId);
    const script = narrationScriptCache.get(key);
    if (script === undefined) {
      throw new Error("party_rpg_missing_narration_script");
    }
    const ttsReady = ttsManifestCache.has(key);
    return showcaseEntryFromNarrationScript(script, ttsReady);
  });
}

function tryCompleteEnrichmentPhase(api: GameHostApi<PartyRpgState>): void {
  if (runtimeState.publicState.stage !== "llm_enrichment") {
    return;
  }
  if (runtimeState.enrichmentResolved) {
    return;
  }
  const players = api.getPlayers();
  const eligible = listRoundPlayersSnapshot(players);
  const roundIndex = runtimeState.publicState.roundIndex;
  for (const player of eligible) {
    const key = pipelineKey(roundIndex, player.playerId);
    if (!narrationScriptCache.has(key)) {
      return;
    }
  }
  if (eligible.length === 0) {
    return;
  }

  const entries = buildShowcaseEntriesFromCaches(players);

  if (!judgeKickoffDoneForRound) {
    judgeKickoffDoneForRound = true;
    void runJudgeEarlyEvaluation(api, entries);
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

async function runJudgeEarlyEvaluation(
  api: GameHostApi<PartyRpgState>,
  entries: PartyRpgState["showcaseEntries"],
): Promise<void> {
  const gateway = getAiGateway();
  const situation = runtimeState.publicState.currentSituation;
  const players = api.getPlayers();
  const sessionEp = pipelineSessionEpoch;
  const roundAt = runtimeState.publicState.roundIndex;

  applyEngineState(
    api,
    reducePartyRpgEngineState(
      runtimeState,
      {
        players,
        status: "running",
        type: "pipeline_judge_status",
      },
      buildContext(Date.now()),
    ),
  );

  if (situation === null || gateway === null) {
    applyEngineState(
      api,
      reducePartyRpgEngineState(
        runtimeState,
        {
          players,
          status: "idle",
          type: "pipeline_judge_status",
        },
        buildContext(Date.now()),
      ),
    );
    return;
  }

  try {
    const judge = await gateway.judgeRound({
      entries: entries.map((entry) => ({
        narrationText: entry.narrationText,
        playerId: entry.playerId,
        playerName:
          players.find((player) => player.playerId === entry.playerId)?.name ??
          entry.playerId,
      })),
      situationPrompt: situation.prompt,
      stale: createStaleGuard(() => pipelineSessionEpoch),
    });

    if (sessionEp !== pipelineSessionEpoch || runtimeState.publicState.roundIndex !== roundAt) {
      return;
    }

    const valid = new Set(
      players.filter((player) => player.role === "player").map((player) => player.playerId),
    );
    const winnerPlayerId = valid.has(judge.winnerPlayerId)
      ? judge.winnerPlayerId
      : pickFallbackWinner(players, entries);

    judgeEarlyResult = {
      commentsByPlayerId: judge.commentsByPlayerId,
      pipelineSessionEpoch: sessionEp,
      roundIndex: roundAt,
      winnerPlayerId,
    };

    applyEngineState(
      api,
      reducePartyRpgEngineState(
        runtimeState,
        {
          players,
          status: "completed",
          type: "pipeline_judge_status",
        },
        buildContext(Date.now()),
      ),
    );
  } catch {
    if (sessionEp !== pipelineSessionEpoch) {
      return;
    }
    judgeEarlyResult = null;
    applyEngineState(
      api,
      reducePartyRpgEngineState(
        runtimeState,
        {
          players,
          status: "failed",
          type: "pipeline_judge_status",
        },
        buildContext(Date.now()),
      ),
    );
  }
}

function ensureNarrationsScheduledForRound(api: GameHostApi<PartyRpgState>): void {
  if (runtimeState.publicState.stage !== "llm_enrichment") {
    return;
  }
  const players = api.getPlayers();
  const eligible = listRoundPlayersSnapshot(players);
  for (const player of eligible) {
    scheduleNarrationForPlayer(api, player.playerId);
  }
  tryCompleteEnrichmentPhase(api);
}

function maybeStartEnrichmentJobs(api: GameHostApi<PartyRpgState>): void {
  if (runtimeState.publicState.stage !== "llm_enrichment") {
    return;
  }
  if (runtimeState.enrichmentResolved) {
    return;
  }
  if (!runtimeState.enrichmentStarted) {
    runtimeState = { ...runtimeState, enrichmentStarted: true };
  }
  ensureNarrationsScheduledForRound(api);
}

function tryConsumeJudgeEarly(api: GameHostApi<PartyRpgState>): boolean {
  const early = judgeEarlyResult;
  if (early === null) {
    return false;
  }
  if (
    early.pipelineSessionEpoch !== pipelineSessionEpoch ||
    early.roundIndex !== runtimeState.publicState.roundIndex
  ) {
    return false;
  }
  judgeEarlyResult = null;
  const players = api.getPlayers();
  applyEngineState(
    api,
    reducePartyRpgEngineState(
      runtimeState,
      {
        commentsByPlayerId: early.commentsByPlayerId,
        players,
        type: "judge_completed",
        winnerId: early.winnerPlayerId,
      },
      buildContext(Date.now()),
    ),
  );
  syncAfterRoundIfNeeded(api);
  publishPartyHubState(api);
  return true;
}

function maybeStartJudgeJob(api: GameHostApi<PartyRpgState>): void {
  if (runtimeState.publicState.stage !== "judge_deliberation") {
    return;
  }
  if (runtimeState.judgeResolved) {
    return;
  }
  if (tryConsumeJudgeEarly(api)) {
    return;
  }
  if (runtimeState.judgeStarted) {
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
  if (tryConsumeJudgeEarly(api)) {
    return;
  }
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
    const comments = isTestFlow()
      ? buildTestFlowJudgeComments(showcase)
      : buildHeuristicComments(showcase);
    applyEngineState(
      api,
      reducePartyRpgEngineState(
        runtimeState,
        {
          commentsByPlayerId: comments,
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
        .filter((player) => isPartyRpgParticipantRole(player.role))
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
    const comments = isTestFlow()
      ? buildTestFlowJudgeComments(showcase)
      : buildHeuristicComments(showcase);
    applyEngineState(
      api,
      reducePartyRpgEngineState(
        runtimeState,
        {
          commentsByPlayerId: comments,
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
  const eligible = players.filter((player) =>
    isPartyRpgParticipantRole(player.role),
  );
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
    .filter((player) => isPartyRpgParticipantRole(player.role))
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
      bumpPipelineSessionEpoch();
      pendingAssetEpoch += 1;
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
      bumpPipelineSessionEpoch();
      pendingAssetEpoch += 1;
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
        if (
          player === undefined ||
          !isPartyRpgParticipantRole(player.role)
        ) {
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
        if (
          player === undefined ||
          !isPartyRpgParticipantRole(player.role)
        ) {
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
        if (
          player === undefined ||
          !isPartyRpgParticipantRole(player.role)
        ) {
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
        scheduleNarrationForPlayer(api, input.playerId);
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
        bumpPipelineSessionEpoch();
        pendingAssetEpoch += 1;
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
      bumpPipelineSessionEpoch();
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

      maybeInjectTestAnswers(api);

      maybeStartAssetJobs(api);
      maybeStartEnrichmentJobs(api);
      maybeStartJudgeJob(api);
      syncAfterRoundIfNeeded(api);
    },
  },
});

export const manifest = gamePlugin.manifest;
export default gamePlugin;
