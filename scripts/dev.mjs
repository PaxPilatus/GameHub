import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const buildScript = resolve("scripts", "build.mjs");
const tscBin = resolve("node_modules", "typescript", "bin", "tsc");
const viteBin = resolve("node_modules", "vite", "bin", "vite.js");
const mobileViteConfig = resolve("apps", "mobile", "vite.config.ts");
const hostRendererViteConfig = resolve("apps", "host", "renderer", "vite.config.ts");
const runElectronDevScript = resolve("scripts", "run-electron-dev.mjs");
const relayEntry = resolve("apps", "relay", "dist", "index.js");
const relayHost = process.env.RELAY_HOST ?? "127.0.0.1";
const relayPort = process.env.RELAY_PORT ?? "8787";
const relayBaseUrl =
  process.env.RELAY_BASE_URL ?? `http://${relayHost}:${relayPort}`;
const relayPublicBaseUrl = process.env.RELAY_PUBLIC_BASE_URL;

const buildResult = spawnSync(process.execPath, [buildScript], {
  stdio: "inherit",
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const children = [];

function startProcess(command, args, env = {}) {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
  });

  children.push(child);
  child.on("exit", (code) => {
    if (code !== 0) {
      console.log(`[dev] child exited with code ${code}`);
    }
  });

  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

startProcess(process.execPath, [tscBin, "-b", "-w", "--preserveWatchOutput"]);
startProcess(process.execPath, [viteBin, "build", "--watch", "--config", mobileViteConfig]);
startProcess(process.execPath, [viteBin, "build", "--watch", "--config", hostRendererViteConfig]);
startProcess(process.execPath, ["--watch", relayEntry], {
  HOST: relayHost,
  PORT: relayPort,
  ...(relayPublicBaseUrl === undefined
    ? {}
    : { PUBLIC_BASE_URL: relayPublicBaseUrl }),
});
setTimeout(() => {
  startProcess(process.execPath, [runElectronDevScript], {
    RELAY_BASE_URL: relayBaseUrl,
  });
}, 1000);