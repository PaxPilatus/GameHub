import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { resolve } from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const hostDir = resolve("apps", "host");
const require = createRequire(import.meta.url);
const electronBinary = require(resolve(hostDir, "node_modules", "electron"));
const relayEntry = resolve("apps", "relay", "dist", "index.js");
const bootstrapEntry = resolve(hostDir, "bootstrap.cjs");
const preloadBridge = resolve(hostDir, "preload.cjs");
const hostRuntimeArtifacts = [
  resolve(hostDir, "dist", "host-service.js"),
  resolve(hostDir, "dist", "plugin-registry.js"),
  resolve(hostDir, "dist", "plugin-runtime.js"),
  resolve(hostDir, "dist", "store.js"),
  resolve(hostDir, "dist", "types.js"),
];
const hostRendererEntry = resolve(hostDir, "dist", "renderer", "index.html");
const READY_TIMEOUT_MS = 15_000;
const RELAY_READY_MARKER = "[relay] listening on ";
const REQUIRED_ARTIFACTS = [
  electronBinary,
  relayEntry,
  bootstrapEntry,
  preloadBridge,
  ...hostRuntimeArtifacts,
  hostRendererEntry,
];

export function formatPortInUseMessage(host, port) {
  return `[start:built] relay port ${host}:${port} is already in use. Stop an existing pnpm dev, relay, or host process and try again.`;
}

export function resolveBuiltRunConfig(env = process.env) {
  const relayHost = env.RELAY_HOST ?? "127.0.0.1";
  const relayPort = parsePort(env.RELAY_PORT ?? "8787");

  return {
    relayBaseUrl: `http://${relayHost}:${relayPort}`,
    relayHost,
    relayPort,
    relayPublicBaseUrl: env.RELAY_PUBLIC_BASE_URL,
  };
}

export async function assertPortAvailable(host, port) {
  await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();

    server.once("error", (error) => {
      const nodeError = error;
      if (nodeError.code === "EADDRINUSE") {
        rejectPromise(new Error(formatPortInUseMessage(host, port)));
        return;
      }

      rejectPromise(error);
    });

    server.once("listening", () => {
      server.close((error) => {
        if (error !== undefined) {
          rejectPromise(error);
          return;
        }

        resolvePromise();
      });
    });

    server.listen(port, host);
  });
}

export function waitForOutputLine(stream, predicate, timeoutMs = READY_TIMEOUT_MS) {
  if (stream === null) {
    return Promise.reject(new Error("[start:built] missing child process output stream."));
  }

  return new Promise((resolvePromise, rejectPromise) => {
    const lineReader = readline.createInterface({
      input: stream,
    });
    const timeout = setTimeout(() => {
      cleanup();
      rejectPromise(
        new Error("[start:built] timed out while waiting for the relay to become ready."),
      );
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      lineReader.off("line", onLine);
      lineReader.off("close", onClose);
      lineReader.close();
    };

    const onLine = (line) => {
      if (!predicate(line)) {
        return;
      }

      cleanup();
      resolvePromise(line);
    };

    const onClose = () => {
      cleanup();
      rejectPromise(
        new Error("[start:built] child process output closed before the relay became ready."),
      );
    };

    lineReader.on("line", onLine);
    lineReader.on("close", onClose);
  });
}

function assertBuiltArtifacts() {
  const missingArtifacts = REQUIRED_ARTIFACTS.filter((artifactPath) => !existsSync(artifactPath));

  if (missingArtifacts.length === 0) {
    return;
  }

  throw new Error(
    `[start:built] built artifacts are missing. Run "corepack pnpm build" first.\n${missingArtifacts.join("\n")}`,
  );
}

function forwardOutput(stream, target) {
  if (stream === null) {
    return;
  }

  stream.on("data", (chunk) => {
    target.write(chunk);
  });
}

function parsePort(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`[start:built] invalid relay port: ${value}`);
  }

  return parsed;
}

function describeExit(code, signal) {
  if (signal !== null) {
    return `signal ${signal}`;
  }

  return `code ${code ?? "unknown"}`;
}

async function waitForExit(child, timeoutMs = 3_000) {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise((resolvePromise) => {
    const timeout = setTimeout(() => {
      resolvePromise();
    }, timeoutMs);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

async function main() {
  assertBuiltArtifacts();

  const config = resolveBuiltRunConfig();
  await assertPortAvailable(config.relayHost, config.relayPort);

  const relayChild = spawn(process.execPath, [relayEntry], {
    env: {
      ...process.env,
      HOST: config.relayHost,
      PORT: String(config.relayPort),
      ...(config.relayPublicBaseUrl === undefined
        ? {}
        : { PUBLIC_BASE_URL: config.relayPublicBaseUrl }),
    },
    stdio: ["inherit", "pipe", "pipe"],
  });
  forwardOutput(relayChild.stdout, process.stdout);
  forwardOutput(relayChild.stderr, process.stderr);

  let shuttingDown = false;
  let hostChild = null;

  async function shutdown(exitCode) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    hostChild?.kill();
    relayChild.kill();
    await Promise.all([
      hostChild === null ? Promise.resolve() : waitForExit(hostChild),
      waitForExit(relayChild),
    ]);
    process.exit(exitCode);
  }

  process.once("SIGINT", () => {
    void shutdown(0);
  });
  process.once("SIGTERM", () => {
    void shutdown(0);
  });

  relayChild.once("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    console.error(`[start:built] relay exited unexpectedly (${describeExit(code, signal)}).`);
    void shutdown(1);
  });

  await waitForOutputLine(relayChild.stdout, (line) => line.includes(RELAY_READY_MARKER));

  console.log(`[start:built] relay ready on ${config.relayBaseUrl}`);

  const electronEnv = {
    ...process.env,
    RELAY_BASE_URL: config.relayBaseUrl,
  };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  hostChild = spawn(electronBinary, [hostDir], {
    cwd: hostDir,
    env: electronEnv,
    stdio: ["inherit", "pipe", "pipe"],
  });
  forwardOutput(hostChild.stdout, process.stdout);
  forwardOutput(hostChild.stderr, process.stderr);

  hostChild.once("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal !== null || (code ?? 0) !== 0) {
      console.error(`[start:built] host exited unexpectedly (${describeExit(code, signal)}).`);
      void shutdown(1);
      return;
    }

    void shutdown(0);
  });
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}


