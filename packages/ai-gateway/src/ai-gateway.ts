import {
  CharacterSummarySchema,
  extractJsonObject,
  JudgeOutputSchema,
  NarrationOutputSchema,
  NarrationScriptSchema,
  type CharacterSummaryOutput,
  type JudgeOutput,
  type NarrationOutput,
  type NarrationScript,
} from "./ai-schemas.js";
import {
  createOpenRouterClient,
  type OpenRouterClientConfig,
} from "./openrouter-client.js";

export interface AiGatewayConfig extends OpenRouterClientConfig {
  chatModel: string;
}

export interface StaleGuard {
  epoch: number;
  isStale(): boolean;
}

export function createStaleGuard(epochGetter: () => number): StaleGuard {
  const epoch = epochGetter();
  return {
    epoch,
    isStale(): boolean {
      return epochGetter() !== epoch;
    },
  };
}

export function createAiGateway(config: AiGatewayConfig) {
  const client = createOpenRouterClient(config);

  async function generateCharacterSummary(input: {
    name: string;
    background: string;
    slogan: string;
    archetype?: string;
    funFact?: string;
    weakness?: string;
    motto?: string;
    signal?: AbortSignal;
    stale?: StaleGuard;
  }): Promise<CharacterSummaryOutput> {
    const system =
      "Du bist ein deutscher Party-Game-Autor. Antworte ausschliesslich als JSON-Objekt mit genau einem Feld summaryShort (string, max 240 Zeichen), humorvoll und familienfreundlich.";
    const user = [
      "Charakter:",
      `name: ${input.name}`,
      `background: ${input.background}`,
      `slogan: ${input.slogan}`,
      input.archetype !== undefined ? `archetype: ${input.archetype}` : "",
      input.funFact !== undefined ? `funFact: ${input.funFact}` : "",
      input.weakness !== undefined ? `weakness: ${input.weakness}` : "",
      input.motto !== undefined ? `motto: ${input.motto}` : "",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const summaryOpts: {
      retries: number;
      timeoutMs: number;
      signal?: AbortSignal;
    } = { retries: 1, timeoutMs: 35_000 };
    if (input.signal !== undefined) {
      summaryOpts.signal = input.signal;
    }

    const { text } = await client.chatCompletionWithRetry(
      {
        maxTokens: 220,
        messages: [
          { content: system, role: "system" },
          { content: user, role: "user" },
        ],
        model: config.chatModel,
        responseFormat: { type: "json_object" },
        temperature: 0.85,
      },
      summaryOpts,
    );

    if (input.stale?.isStale() === true) {
      throw new Error("ai_stale_guard");
    }

    const parsed = extractJsonObject(text);
    return CharacterSummarySchema.parse(parsed);
  }

  async function generateNarration(input: {
    situationPrompt: string;
    characterSummary: string;
    answerText: string;
    signal?: AbortSignal;
    stale?: StaleGuard;
  }): Promise<NarrationOutput> {
    const system =
      "Du bist ein deutscher Show-Erzaehler. Antworte nur als JSON mit Feldern narrationText (string, max 320 Zeichen) und optional audioCueText (kurz, fuer Vorlesen). Keine Anfuehrungszeichen im JSON escapen falsch. Humor, aber nicht verletzend.";
    const user = [
      "Situation:",
      input.situationPrompt,
      "",
      "Charakterkurzbeschreibung:",
      input.characterSummary,
      "",
      "Private Spielerantwort (nicht zitieren wortwoertlich wenn unpassend):",
      input.answerText,
    ].join("\n");

    const narrationOpts: {
      retries: number;
      timeoutMs: number;
      signal?: AbortSignal;
    } = { retries: 1, timeoutMs: 40_000 };
    if (input.signal !== undefined) {
      narrationOpts.signal = input.signal;
    }

    const { text } = await client.chatCompletionWithRetry(
      {
        maxTokens: 320,
        messages: [
          { content: system, role: "system" },
          { content: user, role: "user" },
        ],
        model: config.chatModel,
        responseFormat: { type: "json_object" },
        temperature: 0.9,
      },
      narrationOpts,
    );

    if (input.stale?.isStale() === true) {
      throw new Error("ai_stale_guard");
    }

    const parsed = extractJsonObject(text);
    return NarrationOutputSchema.parse(parsed);
  }

  const NARRATION_SCRIPT_SYSTEM_PROMPT = [
    "Du bist ein deutscher Fantasy-Comedy-Narroator fuer ein Partyspiel.",
    "Antworte ausschliesslich als JSON gemaess dem geforderten Schema.",
    "Die Spielmechanik (Outcome, Wurf-Zusammenfassung) ist final und darf nicht widersprochen werden.",
    "Erfinde keine neuen Regeln, Inventare, Lore oder supernaturalen Faehigkeiten.",
    "Schreibe kurze, klar sprechbare Saetze fuer TTS.",
    "Erzeuge genau vier Segmente mit Sprecher-Reihenfolge: player, judge, player, judge.",
    "Der Judge nennt an der passenden Stelle den Wurf oder das Outcome.",
    "Keine Meta-Kommentare, keine Regelklaerungen, kein Text ausserhalb des JSON.",
    "Bei unsicherem Input: bleib neutral-komisch innerhalb der vorgegebenen Fakten.",
  ].join(" ");

  async function generateNarrationScript(input: {
    characterStyleJson: string;
    mechanicsJson: string;
    roundContextJson: string;
    answerText: string;
    sessionId: string;
    playerId: string;
    roundIndex: number;
    signal?: AbortSignal;
    stale?: StaleGuard;
  }): Promise<NarrationScript> {
    const user = [
      `sessionId: ${input.sessionId}`,
      `playerId: ${input.playerId}`,
      `roundIndex: ${String(input.roundIndex)}`,
      "",
      "CharacterStyleProfile (JSON):",
      input.characterStyleJson,
      "",
      "RoundContext (JSON):",
      input.roundContextJson,
      "",
      "MechanicsContext (JSON):",
      input.mechanicsJson,
      "",
      "Spielerantwort (Roh):",
      input.answerText,
    ].join("\n");

    const narrationOpts: {
      retries: number;
      timeoutMs: number;
      signal?: AbortSignal;
    } = { retries: 1, timeoutMs: 45_000 };
    if (input.signal !== undefined) {
      narrationOpts.signal = input.signal;
    }

    const { text } = await client.chatCompletionWithRetry(
      {
        maxTokens: 520,
        messages: [
          { content: NARRATION_SCRIPT_SYSTEM_PROMPT, role: "system" },
          { content: user, role: "user" },
        ],
        model: config.chatModel,
        responseFormat: { type: "json_object" },
        temperature: 0.85,
      },
      narrationOpts,
    );

    if (input.stale?.isStale() === true) {
      throw new Error("ai_stale_guard");
    }

    const parsed = extractJsonObject(text);
    return NarrationScriptSchema.parse(parsed);
  }

  async function repairNarrationScript(input: {
    brokenJsonText: string;
    mechanicsJson: string;
    signal?: AbortSignal;
    stale?: StaleGuard;
  }): Promise<NarrationScript> {
    const system = [
      "Du reparierst JSON fuer ein Partyspiel.",
      "Antworte nur mit einem JSON-Objekt, das exakt dem Schema entspricht (sessionId, roundIndex, playerId, outcome, rollSummary, segments[4] mit speaker player/judge abwechselnd).",
      "Uebernimm outcome und rollSummary aus MechanicsContext unveraendert.",
    ].join(" ");
    const user = [
      "MechanicsContext (JSON):",
      input.mechanicsJson,
      "",
      "Kaputtes oder ungueltiges JSON:",
      input.brokenJsonText,
    ].join("\n");
    const opts: { retries: number; timeoutMs: number; signal?: AbortSignal } = {
      retries: 0,
      timeoutMs: 25_000,
    };
    if (input.signal !== undefined) {
      opts.signal = input.signal;
    }
    const { text } = await client.chatCompletionWithRetry(
      {
        maxTokens: 520,
        messages: [
          { content: system, role: "system" },
          { content: user, role: "user" },
        ],
        model: config.chatModel,
        responseFormat: { type: "json_object" },
        temperature: 0.2,
      },
      opts,
    );
    if (input.stale?.isStale() === true) {
      throw new Error("ai_stale_guard");
    }
    const parsed = extractJsonObject(text);
    return NarrationScriptSchema.parse(parsed);
  }

  async function judgeRound(input: {
    situationPrompt: string;
    entries: Array<{
      narrationText: string;
      playerId: string;
      playerName: string;
    }>;
    signal?: AbortSignal;
    stale?: StaleGuard;
  }): Promise<JudgeOutput> {
    const system =
      "Du bist ein strenger aber fairer Party-Schiedsrichter. Bewerte nur die gelieferten Show-Texte (nicht persoenlich angreifen). Antworte nur als JSON mit: commentsByPlayerId (Objekt playerId->kurzer Kommentar max 120 Zeichen), scoresByPlayerId (Objekt playerId->Ganzzahl 0-100), winnerPlayerId (exakt eine der playerIds).";
    const user = [
      "Situation:",
      input.situationPrompt,
      "",
      "Eintraege:",
      ...input.entries.map(
        (entry) =>
          `- ${entry.playerId} (${entry.playerName}): ${entry.narrationText}`,
      ),
    ].join("\n");

    const judgeOpts: {
      retries: number;
      timeoutMs: number;
      signal?: AbortSignal;
    } = { retries: 1, timeoutMs: 55_000 };
    if (input.signal !== undefined) {
      judgeOpts.signal = input.signal;
    }

    const { text } = await client.chatCompletionWithRetry(
      {
        maxTokens: 600,
        messages: [
          { content: system, role: "system" },
          { content: user, role: "user" },
        ],
        model: config.chatModel,
        responseFormat: { type: "json_object" },
        temperature: 0.35,
      },
      judgeOpts,
    );

    if (input.stale?.isStale() === true) {
      throw new Error("ai_stale_guard");
    }

    const parsed = extractJsonObject(text);
    return JudgeOutputSchema.parse(parsed);
  }

  return {
    generateCharacterSummary,
    generateNarration,
    generateNarrationScript,
    judgeRound,
    repairNarrationScript,
  };
}

export type AiGateway = ReturnType<typeof createAiGateway>;
