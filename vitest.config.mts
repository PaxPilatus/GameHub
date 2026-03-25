import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@game-hub/protocol": fileURLToPath(
        new URL("./packages/protocol/src/index.ts", import.meta.url),
      ),
      "@game-hub/sdk": fileURLToPath(
        new URL("./packages/sdk/src/index.ts", import.meta.url),
      ),
      "@game-hub/ai-gateway": fileURLToPath(
        new URL("./packages/ai-gateway/src/index.ts", import.meta.url),
      ),
      "@game-hub/party-rpg": fileURLToPath(
        new URL("./plugins/party-rpg/src/index.tsx", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: [
      "packages/**/test/**/*.test.ts",
      "packages/**/test/**/*.test.tsx",
      "apps/**/test/**/*.test.ts",
      "apps/**/test/**/*.test.tsx",
      "plugins/**/test/**/*.test.ts",
      "plugins/**/test/**/*.test.tsx",
    ],
  },
});
