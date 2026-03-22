const { randomUUID } = require("node:crypto");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain } = require("electron");

const diagnostics = [];
let hostService = null;
let mainWindow = null;
let shutdownPromise = null;
let shutdownRequested = false;
let lastLoggedJoinUrl = null;
let lastWarnedJoinUrl = null;

function getHostService() {
  if (hostService === null) {
    throw new Error("Host service is not initialized.");
  }

  return hostService;
}

function pushDiagnostic(event) {
  diagnostics.unshift(event);
  diagnostics.splice(200);
  logDiagnostic(event);
  if (mainWindow !== null) {
    mainWindow.webContents.send("host:diagnostic", event);
  }
}

function sendSnapshot(snapshot) {
  if (mainWindow !== null) {
    mainWindow.webContents.send("host:snapshot", snapshot);
  }
}

function createDiagnostic(level, type, message, data) {
  return {
    data,
    id: randomUUID(),
    level,
    message,
    timestamp: Date.now(),
    type,
  };
}

function logDiagnostic(event) {
  const baseMessage = `[host] ${event.type}: ${event.message}`;
  const detail =
    Object.keys(event.data).length === 0 ? "" : ` ${JSON.stringify(event.data)}`;

  if (event.level === "error") {
    console.error(`${baseMessage}${detail}`);
    return;
  }

  if (event.level === "warn") {
    console.warn(`${baseMessage}${detail}`);
    return;
  }

  console.log(`${baseMessage}${detail}`);
}

function recordDiagnostic(level, type, message, data) {
  pushDiagnostic(createDiagnostic(level, type, message, data));
}

function attachWindowDiagnostics(window) {
  const { webContents } = window;

  webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      recordDiagnostic(
        "error",
        "renderer_load_failed",
        "Renderer failed to load its main document.",
        {
          errorCode,
          errorDescription,
          isMainFrame,
          validatedUrl,
        },
      );
    },
  );

  webContents.on("render-process-gone", (_event, details) => {
    recordDiagnostic(
      "error",
      "renderer_process_gone",
      "Renderer process exited unexpectedly.",
      {
        exitCode: details.exitCode,
        reason: details.reason,
      },
    );
  });

  webContents.on("console-message", (details) => {
    const diagnosticLevel =
      details.level === "error"
        ? "error"
        : details.level === "warning"
          ? "warn"
          : "info";

    if (diagnosticLevel === "info") {
      console.log(
        `[renderer:console] ${details.message} (${details.sourceId}:${details.lineNumber})`,
      );
      return;
    }

    recordDiagnostic(
      diagnosticLevel,
      "renderer_console",
      details.message,
      {
        level: details.level,
        line: details.lineNumber,
        sourceId: details.sourceId,
      },
    );
  });

  webContents.on("preload-error", (_event, preloadPath, error) => {
    recordDiagnostic(
      "error",
      "preload_error",
      error.message,
      {
        preloadPath,
        stack: error.stack ?? null,
      },
    );
  });
}

function isLocalOnlyJoinUrl(joinUrl) {
  try {
    const url = new URL(joinUrl);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "0.0.0.0"
    );
  } catch {
    return false;
  }
}

async function createWindow() {
  const window = new BrowserWindow({
    backgroundColor: "#f4f6f8",
    height: 960,
    minHeight: 840,
    minWidth: 1200,
    title: "Game Hub Host",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.cjs"),
    },
    width: 1440,
  });

  attachWindowDiagnostics(window);
  await window.loadFile(join(__dirname, "dist", "renderer", "index.html"));
  return window;
}

async function bootstrap() {
  const { HostService } = await import(
    pathToFileURL(resolve(__dirname, "dist", "host-service.js")).href
  );
  hostService = new HostService(
    process.env.RELAY_BASE_URL === undefined
      ? {}
      : { relayBaseUrl: process.env.RELAY_BASE_URL },
  );

  const activeHostService = getHostService();
  await activeHostService.initialize();

  activeHostService.subscribeSnapshot((snapshot) => {
    sendSnapshot(snapshot);

    if (snapshot.joinUrl === null || snapshot.joinUrl === lastLoggedJoinUrl) {
      return;
    }

    lastLoggedJoinUrl = snapshot.joinUrl;
    console.log(`[host] join_url ${snapshot.joinUrl}`);

    if (
      isLocalOnlyJoinUrl(snapshot.joinUrl) &&
      snapshot.joinUrl !== lastWarnedJoinUrl
    ) {
      lastWarnedJoinUrl = snapshot.joinUrl;
      recordDiagnostic(
        "warn",
        "join_url_local_only",
        "Join URL points to a local relay address and is not reachable from phones outside this machine.",
        {
          joinUrl: snapshot.joinUrl,
        },
      );
    }
  });
  activeHostService.subscribeDiagnostics((event) => {
    pushDiagnostic(event);
  });

  ipcMain.handle("host:get-initial-state", async () => {
    return {
      availableGames: activeHostService.getAvailableGames(),
      diagnostics: diagnostics.map((event) => ({
        ...event,
        data: { ...event.data },
      })),
      snapshot: activeHostService.getSnapshot(),
    };
  });

  ipcMain.handle("host:restart-session", async () => {
    await activeHostService.restartSession();
  });
  ipcMain.handle("host:select-game", async (_event, gameId) => {
    await activeHostService.selectGame(gameId);
  });
  ipcMain.handle("host:send-plugin-action", async (_event, action, payload) => {
    await activeHostService.sendPluginAction(action, payload);
  });
  ipcMain.handle("host:set-moderator", async (_event, playerId) => {
    await activeHostService.setModerator(playerId);
  });
  ipcMain.handle("host:start-game", async () => {
    await activeHostService.startGame();
  });
  ipcMain.handle("host:stop-game", async () => {
    await activeHostService.stopGame();
  });

  mainWindow = await createWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await activeHostService.start();
}

async function shutdownHost(reason) {
  if (shutdownPromise !== null) {
    return shutdownPromise;
  }

  if (hostService === null) {
    return;
  }

  shutdownPromise = hostService.stop(reason).catch((error) => {
    console.error("[host] shutdown failed", error);
  });
  await shutdownPromise;
}

app.whenReady().then(() => {
  void bootstrap().catch(async (error) => {
    console.error("[host] failed to bootstrap", error);
    await shutdownHost("bootstrap_failed");
    app.exit(1);
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  if (shutdownRequested) {
    return;
  }

  shutdownRequested = true;
  event.preventDefault();
  void shutdownHost("host_shutdown").finally(() => {
    app.quit();
  });
});









