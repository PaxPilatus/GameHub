import { fileURLToPath } from "node:url";

import { createRelayServer } from "./server.js";
import type { RelayServerOptions } from "./server.js";

export {
  createRelayServer,
  type CreateSessionResponse,
  type RelayListenResult,
  type RelayServerOptions,
} from "./server.js";

function readPositiveIntFromEnv(name: string): number | undefined {
  const rawValue = process.env[name];

  if (rawValue === undefined) {
    return undefined;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }

  return parsedValue;
}

function readListFromEnv(name: string): string[] | undefined {
  const rawValue = process.env[name];

  if (rawValue === undefined) {
    return undefined;
  }

  const values = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  return values.length === 0 ? undefined : values;
}

async function main(): Promise<void> {
  const options: RelayServerOptions = {};
  const allowedWebOrigins = readListFromEnv("ALLOWED_WEB_ORIGINS");
  const hostRateLimitMaxMessages = readPositiveIntFromEnv(
    "HOST_RATE_LIMIT_MAX_MESSAGES",
  );
  const hostRateLimitWindowMs = readPositiveIntFromEnv(
    "HOST_RATE_LIMIT_WINDOW_MS",
  );
  const createSessionRateLimitMaxRequests = readPositiveIntFromEnv(
    "CREATE_SESSION_RATE_LIMIT_MAX_REQUESTS",
  );
  const createSessionRateLimitWindowMs = readPositiveIntFromEnv(
    "CREATE_SESSION_RATE_LIMIT_WINDOW_MS",
  );
  const handshakeRateLimitMaxAttempts = readPositiveIntFromEnv(
    "HANDSHAKE_RATE_LIMIT_MAX_ATTEMPTS",
  );
  const handshakeRateLimitWindowMs = readPositiveIntFromEnv(
    "HANDSHAKE_RATE_LIMIT_WINDOW_MS",
  );
  const authFailureRateLimitMaxAttempts = readPositiveIntFromEnv(
    "AUTH_FAILURE_RATE_LIMIT_MAX_ATTEMPTS",
  );
  const authFailureRateLimitWindowMs = readPositiveIntFromEnv(
    "AUTH_FAILURE_RATE_LIMIT_WINDOW_MS",
  );

  if (process.env.HOST !== undefined) {
    options.host = process.env.HOST;
  }

  if (process.env.PORT !== undefined) {
    options.port = Number(process.env.PORT);
  }

  if (process.env.PUBLIC_BASE_URL !== undefined) {
    options.publicBaseUrl = process.env.PUBLIC_BASE_URL;
  }

  if (allowedWebOrigins !== undefined) {
    options.allowedWebOrigins = allowedWebOrigins;
  }

  if (hostRateLimitMaxMessages !== undefined) {
    options.hostRateLimitMaxMessages = hostRateLimitMaxMessages;
  }

  if (hostRateLimitWindowMs !== undefined) {
    options.hostRateLimitWindowMs = hostRateLimitWindowMs;
  }

  if (createSessionRateLimitMaxRequests !== undefined) {
    options.createSessionRateLimitMaxRequests = createSessionRateLimitMaxRequests;
  }

  if (createSessionRateLimitWindowMs !== undefined) {
    options.createSessionRateLimitWindowMs = createSessionRateLimitWindowMs;
  }

  if (handshakeRateLimitMaxAttempts !== undefined) {
    options.handshakeRateLimitMaxAttempts = handshakeRateLimitMaxAttempts;
  }

  if (handshakeRateLimitWindowMs !== undefined) {
    options.handshakeRateLimitWindowMs = handshakeRateLimitWindowMs;
  }

  if (authFailureRateLimitMaxAttempts !== undefined) {
    options.authFailureRateLimitMaxAttempts = authFailureRateLimitMaxAttempts;
  }

  if (authFailureRateLimitWindowMs !== undefined) {
    options.authFailureRateLimitWindowMs = authFailureRateLimitWindowMs;
  }

  const relay = createRelayServer(options);
  const { host, port } = await relay.listen();
  console.log(`[relay] listening on http://${host}:${port}`);

  const shutdown = async () => {
    await relay.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  void main().catch((error: unknown) => {
    console.error("[relay] failed to start", error);
    process.exit(1);
  });
}
