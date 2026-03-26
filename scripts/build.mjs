import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const tscBin = resolve("node_modules", "typescript", "bin", "tsc");
const viteBin = resolve("node_modules", "vite", "bin", "vite.js");
const mobileViteConfig = resolve("apps", "mobile", "vite.config.ts");
const hostRendererViteConfig = resolve("apps", "host", "renderer", "vite.config.ts");
const staleHostArtifacts = [
  resolve("apps", "host", "dist", "main.js"),
  resolve("apps", "host", "dist", "main.js.map"),
  resolve("apps", "host", "dist", "main.d.ts"),
  resolve("apps", "host", "dist", "main.d.ts.map"),
  resolve("apps", "host", "dist", "preload.js"),
  resolve("apps", "host", "dist", "preload.js.map"),
  resolve("apps", "host", "dist", "preload.d.ts"),
  resolve("apps", "host", "dist", "preload.d.ts.map"),
  resolve("apps", "host", "dist", "renderer.js"),
  resolve("apps", "host", "dist", "renderer.js.map"),
  resolve("apps", "host", "dist", "renderer.d.ts"),
  resolve("apps", "host", "dist", "renderer.d.ts.map"),
  resolve("apps", "host", "dist", "index.html"),
];

for (const artifactPath of staleHostArtifacts) {
  rmSync(artifactPath, { force: true });
}

const tscResult = spawnSync(process.execPath, [tscBin, "-b"], {
  stdio: "inherit",
});

if (tscResult.status !== 0) {
  process.exit(tscResult.status ?? 1);
}

const partyRpgAssetsSrc = resolve("plugins", "party-rpg", "src", "assets");
const partyRpgAssetsDst = resolve("plugins", "party-rpg", "dist", "assets");
if (existsSync(partyRpgAssetsSrc)) {
  cpSync(partyRpgAssetsSrc, partyRpgAssetsDst, { recursive: true });
}

for (const configPath of [mobileViteConfig, hostRendererViteConfig]) {
  const viteResult = spawnSync(
    process.execPath,
    [viteBin, "build", "--config", configPath],
    {
      stdio: "inherit",
    },
  );

  if (viteResult.status !== 0) {
    process.exit(viteResult.status ?? 1);
  }
}
