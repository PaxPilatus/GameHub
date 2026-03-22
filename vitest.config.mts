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
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts", "plugins/**/test/**/*.test.ts"],
  },
});
