import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appDir = dirname(fileURLToPath(import.meta.url));

// Builds the mobile client into apps/mobile/dist so the relay can serve it at /.
export default defineConfig({
  root: appDir,
  build: {
    emptyOutDir: true,
    outDir: resolve(appDir, "dist"),
    sourcemap: false,
  },
  plugins: [react()],
  publicDir: false,
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
