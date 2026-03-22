const { contextBridge, ipcRenderer } = require("electron");

function createSubscription(channel, listener) {
  const wrapped = (_event, payload) => {
    listener(payload);
  };

  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.off(channel, wrapped);
  };
}

contextBridge.exposeInMainWorld("hostApi", {
  getInitialState() {
    return ipcRenderer.invoke("host:get-initial-state");
  },
  onDiagnostic(listener) {
    return createSubscription("host:diagnostic", listener);
  },
  onSnapshot(listener) {
    return createSubscription("host:snapshot", listener);
  },
  restartSession() {
    return ipcRenderer.invoke("host:restart-session");
  },
  selectGame(gameId) {
    return ipcRenderer.invoke("host:select-game", gameId);
  },
  sendPluginAction(action, payload) {
    return ipcRenderer.invoke("host:send-plugin-action", action, payload);
  },
  setModerator(playerId) {
    return ipcRenderer.invoke("host:set-moderator", playerId);
  },
  startGame() {
    return ipcRenderer.invoke("host:start-game");
  },
  stopGame() {
    return ipcRenderer.invoke("host:stop-game");
  },
});


