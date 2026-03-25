export interface OpenRouterClientConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  referer?: string;
  title?: string;
}

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterChatRequest {
  model: string;
  messages: ChatCompletionMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: "json_object" };
}

export interface OpenRouterChatResponse {
  text: string;
  raw: unknown;
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createOpenRouterClient(config: OpenRouterClientConfig) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");

  async function chatCompletion(
    request: OpenRouterChatRequest,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<OpenRouterChatResponse> {
    const timeoutMs = options.timeoutMs ?? 45_000;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      };
      if (config.referer !== undefined && config.referer !== "") {
        headers["HTTP-Referer"] = config.referer;
      }
      if (config.title !== undefined && config.title !== "") {
        headers["X-Title"] = config.title;
      }

      const body: Record<string, unknown> = {
        model: request.model,
        messages: request.messages,
      };
      if (request.maxTokens !== undefined) {
        body.max_tokens = request.maxTokens;
      }
      if (request.temperature !== undefined) {
        body.temperature = request.temperature;
      }
      if (request.responseFormat !== undefined) {
        body.response_format = request.responseFormat;
      }

      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        body: JSON.stringify(body),
        headers,
        method: "POST",
        signal: options.signal ?? controller.signal,
      });

      if (!response.ok) {
        const detail = await safeReadText(response);
        throw new Error(
          `OpenRouter request failed (${String(response.status)}): ${detail ?? "no body"}`,
        );
      }

      const raw = (await response.json()) as unknown;
      const text = extractChoiceText(raw);

      if (text.trim() === "") {
        throw new Error("OpenRouter returned an empty completion.");
      }

      return { raw, text };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async function chatCompletionWithRetry(
    request: OpenRouterChatRequest,
    options: { signal?: AbortSignal; retries?: number; timeoutMs?: number } = {},
  ): Promise<OpenRouterChatResponse> {
    const retries = options.retries ?? 1;
    let lastError: unknown;

    for (let attempt = 0;attempt <= retries;attempt += 1) {
      try {
        const chatOpts: { timeoutMs?: number; signal?: AbortSignal } = {};
        if (options.timeoutMs !== undefined) {
          chatOpts.timeoutMs = options.timeoutMs;
        }
        if (options.signal !== undefined) {
          chatOpts.signal = options.signal;
        }
        return await chatCompletion(request, chatOpts);
      } catch (error) {
        lastError = error;
        if (attempt >= retries) {
          break;
        }
        const backoffMs = 400 * (attempt + 1);
        await sleep(backoffMs);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("OpenRouter request failed after retries.");
  }

  return {
    chatCompletion,
    chatCompletionWithRetry,
  };
}

async function safeReadText(response: Response): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function extractChoiceText(raw: unknown): string {
  if (typeof raw !== "object" || raw === null) {
    return "";
  }

  const choices = (raw as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const first = choices[0];
  if (typeof first !== "object" || first === null) {
    return "";
  }

  const message = (first as { message?: { content?: unknown } }).message;
  if (
    typeof message !== "object" ||
    message === null ||
    typeof message.content !== "string"
  ) {
    return "";
  }

  return message.content;
}
