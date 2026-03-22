import type { GameCentralProps, GameMobileProps } from "@game-hub/sdk";
import { createGamePlugin } from "@game-hub/sdk";

export interface DebugState extends Record<string, unknown> {
  connectedPlayers: number;
  counter: number;
  lastEvent: string;
  ticks: number;
}

const debugManifest = {
  description: "Minimales Debug-Spiel fuer Runtime- und UI-Wiring.",
  displayName: "Debug Counter",
  id: "debug",
  tickHz: 1,
  version: "0.1.0",
} as const;

function readIncrementPayload(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function createSummary(state: DebugState): string {
  return `${state.lastEvent} · counter ${state.counter} · ticks ${state.ticks}`;
}

function DebugMobileView(props: GameMobileProps<DebugState>) {
  const counter = props.pluginState?.counter ?? 0;
  const ticks = props.pluginState?.ticks ?? 0;

  return (
    <div className="plugin-stack">
      <p className="plugin-copy">
        Debug Counter fuer schnelle End-to-End-Pruefung.
      </p>
      <div className="plugin-stats">
        <span>Counter {counter}</span>
        <span>Ticks {ticks}</span>
      </div>
      <button type="button" onClick={() => props.sendInput("increment", 1)}>
        Increment
      </button>
    </div>
  );
}

function DebugCentralView(props: GameCentralProps<DebugState>) {
  const state = props.pluginState;

  return (
    <div className="plugin-stack">
      <p className="plugin-copy">{state === null ? "Plugin state pending." : createSummary(state)}</p>
      <div className="plugin-stats">
        <span>Connected {state?.connectedPlayers ?? props.players.length}</span>
        <span>Session {props.sessionId ?? "pending"}</span>
      </div>
      <button type="button" onClick={() => void props.invokeHostAction("increment", 1)}>
        Increment From Host
      </button>
    </div>
  );
}

export const gamePlugin = createGamePlugin<DebugState, number>({
  central: DebugCentralView,
  createInitialState() {
    return {
      connectedPlayers: 0,
      counter: 0,
      lastEvent: "idle",
      ticks: 0,
    };
  },
  manifest: debugManifest,
  mobile: DebugMobileView,
  parseInput(message) {
    return readIncrementPayload(message.value);
  },
  server: {
    onGameStart(api) {
      api.updateState((state) => ({
        ...state,
        lastEvent: "game_started",
      }));
    },
    onGameStop(api) {
      api.updateState((state) => ({
        ...state,
        lastEvent: "game_stopped",
      }));
    },
    onInput(api, input) {
      if (input.action !== "increment") {
        return;
      }

      api.updateState((state) => ({
        ...state,
        counter: state.counter + (input.payload ?? 1),
        lastEvent: `input:${input.playerId}`,
      }));
    },
    onPlayerJoin(api) {
      api.updateState((state) => ({
        ...state,
        connectedPlayers: api.getPlayers().filter((player) => player.connected).length,
        lastEvent: "player_joined",
      }));
    },
    onPlayerLeave(api) {
      api.updateState((state) => ({
        ...state,
        connectedPlayers: api.getPlayers().filter((player) => player.connected).length,
        lastEvent: "player_left",
      }));
    },
    onPlayerReconnect(api) {
      api.updateState((state) => ({
        ...state,
        connectedPlayers: api.getPlayers().filter((player) => player.connected).length,
        lastEvent: "player_reconnected",
      }));
    },
    onSessionCreated(api) {
      api.updateState((state) => ({
        ...state,
        connectedPlayers: api.getPlayers().filter((player) => player.connected).length,
        lastEvent: "session_created",
      }));
    },
    onTick(api) {
      api.updateState((state) => ({
        ...state,
        ticks: state.ticks + 1,
      }));
    },
  },
});

export const manifest = gamePlugin.manifest;
export default gamePlugin;
