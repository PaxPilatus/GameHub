import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const hostDir = resolve("apps", "host");
const require = createRequire(import.meta.url);
const electronBinary = require(resolve(hostDir, "node_modules", "electron"));
const bootstrapEntry = resolve(hostDir, "bootstrap.cjs");
const preloadBridge = resolve(hostDir, "preload.cjs");
const hostRuntimeArtifacts = [
  resolve(hostDir, "dist", "host-service.js"),
  resolve(hostDir, "dist", "plugin-registry.js"),
  resolve(hostDir, "dist", "plugin-runtime.js"),
  resolve(hostDir, "dist", "store.js"),
  resolve(hostDir, "dist", "types.js"),
];
const rendererEntry = resolve(hostDir, "dist", "renderer", "index.html");
const requiredArtifacts = [
  electronBinary,
  bootstrapEntry,
  preloadBridge,
  ...hostRuntimeArtifacts,
  rendererEntry,
];
const watchDir = resolve(hostDir, "dist");
const relayBaseUrl = process.env.RELAY_BASE_URL ?? "http://127.0.0.1:8787";

let child = null;
let debounceTimer;
let shuttingDown = false;
let restartInProgress = false;
let waitingForArtifacts = false;

function hasRequiredArtifacts() {
  return requiredArtifacts.every((artifactPath) => existsSync(artifactPath));
}

function logWaitingForArtifacts() {
  if (waitingForArtifacts) {
    return;
  }

  waitingForArtifacts = true;
  console.log("[dev] waiting for host build artifacts...");
}

function scheduleRestart(delay = 400) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (child === null) {
      startElectron();
      return;
    }

    restartElectron();
  }, delay);
}

function startElectron() {
  if (child !== null || shuttingDown || restartInProgress) {
    return;
  }

  if (!hasRequiredArtifacts()) {
    logWaitingForArtifacts();
    return;
  }

  waitingForArtifacts = false;
  const electronEnv = {
    ...process.env,
    RELAY_BASE_URL: relayBaseUrl,
  };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  child = spawn(electronBinary, [hostDir], {
    cwd: hostDir,
    env: electronEnv,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    child = null;

    const shouldRestart = restartInProgress;
    restartInProgress = false;

    if (shouldRestart) {
      if (!shuttingDown) {
        startElectron();
      }
      return;
    }

    if (!shuttingDown && signal === null && code !== 0) {
      console.log(`[dev] electron exited with code ${code}, retrying...`);
      scheduleRestart(1000);
    }
  });
}

function restartElectron() {
  if (child === null) {
    startElectron();
    return;
  }

  restartInProgress = true;
  child.kill();
}

watch(
  watchDir,
  {
    recursive: true,
  },
  () => {
    waitingForArtifacts = false;
    scheduleRestart();
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shuttingDown = true;
    restartInProgress = false;
    clearTimeout(debounceTimer);
    child?.kill();
    process.exit(0);
  });
}

scheduleRestart(600);


