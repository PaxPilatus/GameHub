const { randomUUID } = require("node:crypto");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const electron = require("electron");
const electronMain =
  electron.app === undefined ? require("electron/main") : electron;
const app = electronMain.app;
const BrowserWindow = electronMain.BrowserWindow ?? electron.BrowserWindow;
const ipcMain = electronMain.ipcMain ?? electron.ipcMain;
const screen = electronMain.screen ?? electron.screen;

const diagnostics = [];
let centralWindow = null;
let hostService = null;
let mainWindow = null;
let shutdownPromise = null;
let shutdownRequested = false;
let lastLoggedJoinUrl = null;
let lastWarnedJoinUrl = null;
let sanitizeDiagnosticEvent = (event) => event;
let sanitizeHostSnapshot = (snapshot) => snapshot;
let assertWindowAccess = () => undefined;
let parseGameId = (value) => value;
let parsePlayerId = (value) => value;
let parsePluginAction = (action, payload) => ({ action, payload });

function getHostService() {
  if (hostService === null) {
    throw new Error("Host service is not initialized.");
  }

  return hostService;
}

function getTrackedWindows() {
  return [mainWindow, centralWindow].filter(
    (window) => window !== null && !window.isDestroyed(),
  );
}

function getWindowKind(window) {
  return window?.__hostWindowKind === "central" ? "central" : "admin";
}

function getSenderWindowKind(webContents) {
  return getWindowKind(BrowserWindow.fromWebContents(webContents));
}

function pushDiagnostic(event) {
  const sanitizedEvent = sanitizeDiagnosticEvent(event);
  diagnostics.unshift(sanitizedEvent);
  diagnostics.splice(200);
  logDiagnostic(sanitizedEvent);

  for (const window of getTrackedWindows()) {
    window.webContents.send("host:diagnostic", sanitizedEvent);
  }
}

function sendSnapshot(snapshot) {
  const sanitizedSnapshot = sanitizeHostSnapshot(snapshot);

  for (const window of getTrackedWindows()) {
    window.webContents.send("host:snapshot", sanitizedSnapshot);
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

function describeError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Unknown error";
}

async function runProtectedIpcAction(channel, windowKind, action) {
  try {
    return await action();
  } catch (error) {
    recordDiagnostic("error", "ipc_action_failed", `${channel} failed.`, {
      action: channel,
      error: describeError(error),
      windowKind,
    });
    return null;
  }
}

function attachWindowDiagnostics(window, windowKind) {
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
          windowKind,
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
        windowKind,
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
        `[renderer:${windowKind}] ${details.message} (${details.sourceId}:${details.lineNumber})`,
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
        windowKind,
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
        windowKind,
      },
    );
  });
}

function hardenWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
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

async function loadRendererWindow(window, view) {
  await window.loadFile(join(__dirname, "dist", "renderer", "index.html"), {
    query: { view },
  });
}

async function createAdminWindow() {
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
      sandbox: true,
      webSecurity: true,
    },
    width: 1440,
  });

  window.__hostWindowKind = "admin";
  hardenWindow(window);
  attachWindowDiagnostics(window, "admin");
  await loadRendererWindow(window, "admin");
  return window;
}

function pickCentralDisplay() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  return displays.find((display) => display.id !== primaryDisplay.id) ?? primaryDisplay;
}

async function createCentralWindow() {
  const display = pickCentralDisplay();
  const window = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#09131b",
    frame: false,
    fullscreenable: true,
    height: display.workArea.height,
    show: false,
    title: "Game Hub Central",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.cjs"),
      sandbox: true,
      webSecurity: true,
    },
    width: display.workArea.width,
    x: display.workArea.x,
    y: display.workArea.y,
  });

  window.__hostWindowKind = "central";
  hardenWindow(window);
  attachWindowDiagnostics(window, "central");
  await loadRendererWindow(window, "central");
  return window;
}

async function ensureCentralWindow(options = {}) {
  const { enterFullScreen = false, focus = false } = options;

  if (centralWindow === null || centralWindow.isDestroyed()) {
    centralWindow = await createCentralWindow();
    centralWindow.on("closed", () => {
      centralWindow = null;
    });
  }

  if (!centralWindow.isVisible()) {
    centralWindow.show();
  }

  if (enterFullScreen && !centralWindow.isFullScreen()) {
    centralWindow.setFullScreen(true);
  }

  if (focus) {
    centralWindow.focus();
  }

  return centralWindow;
}

async function closeCentralWindow() {
  if (centralWindow === null || centralWindow.isDestroyed()) {
    centralWindow = null;
    return;
  }

  const window = centralWindow;
  centralWindow = null;
  window.close();
}

function toggleWindowFullscreen(window) {
  if (window === null || window.isDestroyed()) {
    return;
  }

  window.setFullScreen(!window.isFullScreen());
}

async function bootstrap() {
  const [{ HostService }, securityModule, ipcPolicyModule] = await Promise.all([
    import(pathToFileURL(resolve(__dirname, "dist", "host-service.js")).href),
    import(pathToFileURL(resolve(__dirname, "dist", "security.js")).href),
    import(pathToFileURL(resolve(__dirname, "dist", "ipc-policy.js")).href),
  ]);
  sanitizeDiagnosticEvent = securityModule.sanitizeDiagnosticEvent;
  sanitizeHostSnapshot = securityModule.sanitizeHostSnapshot;
  assertWindowAccess = ipcPolicyModule.assertWindowAccess;
  parseGameId = ipcPolicyModule.parseGameId;
  parsePlayerId = ipcPolicyModule.parsePlayerId;
  parsePluginAction = ipcPolicyModule.parsePluginAction;

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
      snapshot: sanitizeHostSnapshot(activeHostService.getSnapshot()),
    };
  });

  ipcMain.handle("host:close-central-window", async (event) => {
    assertWindowAccess(
      "host:close-central-window",
      getSenderWindowKind(event.sender),
      ["admin", "central"],
    );
    await closeCentralWindow();
  });
  ipcMain.handle("host:open-central-window", async (event) => {
    assertWindowAccess(
      "host:open-central-window",
      getSenderWindowKind(event.sender),
      ["admin"],
    );
    await ensureCentralWindow({ focus: true });
  });
  ipcMain.handle("host:restart-game", async (event) => {
    const windowKind = getSenderWindowKind(event.sender);
    assertWindowAccess("host:restart-game", windowKind, ["admin", "central"]);
    await runProtectedIpcAction("host:restart-game", windowKind, async () => {
      await activeHostService.restartGame();

      if (activeHostService.getSnapshot().lifecycle === "game_running") {
        await ensureCentralWindow({ enterFullScreen: true, focus: true });
      }
    });
  });
  ipcMain.handle("host:restart-session", async (event) => {
    const windowKind = getSenderWindowKind(event.sender);
    assertWindowAccess("host:restart-session", windowKind, ["admin"]);
    await runProtectedIpcAction("host:restart-session", windowKind, async () => {
      await activeHostService.restartSession();
    });
  });
  ipcMain.handle("host:select-game", async (event, gameId) => {
    const windowKind = getSenderWindowKind(event.sender);
    assertWindowAccess("host:select-game", windowKind, ["admin"]);
    await runProtectedIpcAction("host:select-game", windowKind, async () => {
      await activeHostService.selectGame(parseGameId(gameId));
    });
  });
  ipcMain.handle("host:send-plugin-action", async (event, action, payload) => {
    const windowKind = getSenderWindowKind(event.sender);
    assertWindowAccess("host:send-plugin-action", windowKind, ["admin"]);
    await runProtectedIpcAction("host:send-plugin-action", windowKind, async () => {
      const parsed = parsePluginAction(action, payload);
      await activeHostService.sendPluginAction(parsed.action, parsed.payload);
    });
  });
  ipcMain.handle("host:set-moderator", async (event, playerId) => {
    const windowKind = getSenderWindowKind(event.sender);
    assertWindowAccess("host:set-moderator", windowKind, ["admin"]);
    await runProtectedIpcAction("host:set-moderator", windowKind, async () => {
      await activeHostService.setModerator(parsePlayerId(playerId));
    });
  });
  ipcMain.handle("host:start-game", async (event) => {
    const windowKind = getSenderWindowKind(event.sender);
    assertWindowAccess("host:start-game", windowKind, ["admin"]);
    await runProtectedIpcAction("host:start-game", windowKind, async () => {
      await activeHostService.startGame();

      if (activeHostService.getSnapshot().lifecycle === "game_running") {
        await ensureCentralWindow({ enterFullScreen: true, focus: true });
      }
    });
  });
  ipcMain.handle("host:stop-game", async (event) => {
    const windowKind = getSenderWindowKind(event.sender);
    assertWindowAccess("host:stop-game", windowKind, ["admin"]);
    await runProtectedIpcAction("host:stop-game", windowKind, async () => {
      await activeHostService.stopGame();
    });
  });
  ipcMain.handle("host:toggle-current-window-fullscreen", async (event) => {
    assertWindowAccess(
      "host:toggle-current-window-fullscreen",
      getSenderWindowKind(event.sender),
      ["admin", "central"],
    );
    const window = BrowserWindow.fromWebContents(event.sender);
    toggleWindowFullscreen(window);
  });

  mainWindow = await createAdminWindow();
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



