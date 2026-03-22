import { fileURLToPath } from "node:url";

import { createRelayServer } from "./server.js";

export {
  createRelayServer,
  type CreateSessionResponse,
  type RelayListenResult,
  type RelayServerOptions,
} from "./server.js";

async function main(): Promise<void> {
  const relay = createRelayServer({
    ...(process.env.HOST === undefined ? {} : { host: process.env.HOST }),
    ...(process.env.PORT === undefined
      ? {}
      : { port: Number(process.env.PORT) }),
    ...(process.env.PUBLIC_BASE_URL === undefined
      ? {}
      : { publicBaseUrl: process.env.PUBLIC_BASE_URL }),
  });

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
