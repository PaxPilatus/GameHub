import { useEffect, useRef } from "react";

import type { InputMessage } from "@game-hub/protocol";
import {
  createGamePlugin,
  type GameCentralProps,
  type GameHostApi,
  type GameMobileProps,
} from "@game-hub/sdk";

import {
  SNAKE_DEFAULT_TICK_HZ,
  SNAKE_DIRECTION_ACTION,
  SNAKE_EFFECT_ACTION,
  SNAKE_RESTART_ACTION,
  createInitialSnakeEngineState,
  createSnakeContext,
  reduceSnakeEngineState,
  type SnakeDirection,
  type SnakeEngineState,
  type SnakePlayerState,
  type SnakePoint,
  type SnakeState,
} from "./reducer.js";

interface SnakeDirectionPayload {
  dir: SnakeDirection;
}

interface SnakeActionPayload {
  type: "boost";
}

type SnakeInputPayload = SnakeDirectionPayload | SnakeActionPayload | undefined;

const snakeContext = createSnakeContext({
  tickHz: SNAKE_DEFAULT_TICK_HZ,
});

let runtimeState = createInitialSnakeEngineState([], snakeContext);

function SnakeMobileView(props: GameMobileProps<SnakeState>) {
  const state = props.pluginState;
  const playerSnake =
    props.playerId === null || state === null
      ? null
      : state.snakes.find((snake) => snake.playerId === props.playerId) ?? null;
  const controlsEnabled =
    state?.stage === "running" &&
    props.phase === "game_running" &&
    playerSnake?.alive === true;

  return (
    <div className="plugin-stack snake-mobile-stack">
      <div className="snake-banner">
        <div>
          <strong>
            {state === null
              ? "Snake is loading."
              : state.stage === "lobby"
                ? "Waiting for the host to start Snake."
                : state.stage === "game_over"
                  ? state.winnerPlayerId === null
                    ? "Round ended in a draw."
                    : `${resolvePlayerName(state.snakes, state.winnerPlayerId)} won the round.`
                  : state.latestMessage}
          </strong>
          <span>
            Relay {props.hostState?.relayStatus ?? "pending"} · phase {props.phase}
          </span>
        </div>
        <div className="snake-mobile-meta">
          <span>{playerSnake?.alive === true ? "alive" : "spectating"}</span>
          <span>{playerSnake?.wins ?? 0} wins</span>
        </div>
      </div>

      <div className="snake-mobile-board-copy">
        <strong>{playerSnake?.name ?? "Player"}</strong>
        <span>
          {controlsEnabled
            ? "Tap a direction. Last input before the next tick wins."
            : state?.stage === "running"
              ? "You can reconnect and respawn when the host still has an active round."
              : "Controls unlock once the host starts the round."}
        </span>
      </div>

      <div className="snake-dpad" role="group" aria-label="Snake direction pad">
        <div />
        <DirectionButton
          direction="up"
          disabled={!controlsEnabled}
          onPress={() => {
            props.sendInput(SNAKE_DIRECTION_ACTION, { dir: "up" });
          }}
        />
        <div />
        <DirectionButton
          direction="left"
          disabled={!controlsEnabled}
          onPress={() => {
            props.sendInput(SNAKE_DIRECTION_ACTION, { dir: "left" });
          }}
        />
        <DirectionButton
          direction="down"
          disabled={!controlsEnabled}
          onPress={() => {
            props.sendInput(SNAKE_DIRECTION_ACTION, { dir: "down" });
          }}
        />
        <DirectionButton
          direction="right"
          disabled={!controlsEnabled}
          onPress={() => {
            props.sendInput(SNAKE_DIRECTION_ACTION, { dir: "right" });
          }}
        />
      </div>

      <div className="snake-mobile-stats">
        <span>Grid {state?.grid.width ?? snakeContext.gridWidth} × {state?.grid.height ?? snakeContext.gridHeight}</span>
        <span>Tick {state?.tick ?? 0}</span>
        <span>Alive {state?.aliveCount ?? 0}</span>
      </div>
    </div>
  );
}

function SnakeCentralView(props: GameCentralProps<SnakeState>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const state = props.pluginState;

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null || state === null) {
      return;
    }

    const context = canvas.getContext("2d");

    if (context === null) {
      return;
    }

    const cellSize = 18;
    canvas.width = state.grid.width * cellSize;
    canvas.height = state.grid.height * cellSize;

    context.fillStyle = "#09131b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;

    for (let x = 0; x <= state.grid.width; x += 1) {
      context.beginPath();
      context.moveTo(x * cellSize + 0.5, 0);
      context.lineTo(x * cellSize + 0.5, canvas.height);
      context.stroke();
    }

    for (let y = 0; y <= state.grid.height; y += 1) {
      context.beginPath();
      context.moveTo(0, y * cellSize + 0.5);
      context.lineTo(canvas.width, y * cellSize + 0.5);
      context.stroke();
    }

    for (const snake of state.snakes) {
      for (let index = 0; index < snake.segments.length; index += 1) {
        const segment = snake.segments[index];

        if (segment === undefined) {
          continue;
        }

        context.fillStyle =
          index === 0 ? snake.color : withAlpha(snake.color, snake.alive ? 0.72 : 0.35);
        context.fillRect(
          segment.x * cellSize + 1,
          segment.y * cellSize + 1,
          cellSize - 2,
          cellSize - 2,
        );
      }
    }
  }, [state]);

  return (
    <div className="plugin-stack snake-central-stack">
      <div className="snake-banner">
        <div>
          <strong>
            {state === null
              ? "Snake state pending."
              : state.stage === "game_over"
                ? state.winnerPlayerId === null
                  ? "Round ended in a draw."
                  : `${resolvePlayerName(state.snakes, state.winnerPlayerId)} won the round.`
                : state.latestMessage}
          </strong>
          <span>
            Relay {props.relayStatus ?? "pending"} · session {props.sessionId ?? "pending"}
          </span>
        </div>
        <div className="snake-central-meta">
          <span>{state?.stage ?? "lobby"}</span>
          <span>{state?.tickHz ?? snakeContext.tickHz} Hz</span>
          <span>{state?.aliveCount ?? 0} alive</span>
        </div>
      </div>

      <div className="snake-canvas-shell">
        <canvas ref={canvasRef} className="snake-canvas" />
      </div>

      <div className="snake-scoreboard">
        {state?.snakes.map((snake) => (
          <article key={snake.playerId} className="snake-score-row">
            <div className="snake-score-player">
              <span className="snake-color-dot" style={{ backgroundColor: snake.color }} />
              <div>
                <strong>{snake.name}</strong>
                <span>
                  Team {snake.team} · {snake.connected ? "connected" : "offline"}
                </span>
              </div>
            </div>
            <div className="snake-score-meta">
              <span>{snake.alive ? "alive" : "dead"}</span>
              <span>{snake.wins} wins</span>
              <span>{snake.direction}</span>
            </div>
          </article>
        ))}
      </div>

      {state?.stage === "game_over" ? (
        <button
          type="button"
          onClick={() => {
            void props.invokeHostAction(SNAKE_RESTART_ACTION);
          }}
        >
          Restart Round
        </button>
      ) : null}
    </div>
  );
}

interface DirectionButtonProps {
  direction: SnakeDirection;
  disabled: boolean;
  onPress(): void;
}

function DirectionButton(props: DirectionButtonProps) {
  const labels: Record<SnakeDirection, string> = {
    down: "↓",
    left: "←",
    right: "→",
    up: "↑",
  };

  return (
    <button
      type="button"
      className={`snake-direction-button snake-direction-${props.direction}`}
      disabled={props.disabled}
      onClick={props.onPress}
    >
      {labels[props.direction]}
    </button>
  );
}

function applyState(
  api: GameHostApi<SnakeState>,
  nextState: SnakeEngineState,
): void {
  runtimeState = nextState;
  api.setState(nextState.publicState);
}

function parseInput(message: InputMessage): SnakeInputPayload {
  if (message.action === SNAKE_DIRECTION_ACTION) {
    const dir = readDirectionValue(message.value);
    return dir === null ? undefined : { dir };
  }

  if (message.action === SNAKE_EFFECT_ACTION && isSnakeActionValue(message.value)) {
    return message.value;
  }

  return undefined;
}

function readDirectionValue(value: unknown): SnakeDirection | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "dir" in value &&
    isSnakeDirection(value.dir)
  ) {
    return value.dir;
  }

  return null;
}

function isSnakeActionValue(value: unknown): value is SnakeActionPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "boost"
  );
}

function isSnakeDirection(value: unknown): value is SnakeDirection {
  return value === "up" || value === "down" || value === "left" || value === "right";
}

function syncPlayers(api: GameHostApi<SnakeState>): void {
  applyState(
    api,
    reduceSnakeEngineState(
      runtimeState,
      {
        players: api.getPlayers(),
        type: "session_synced",
      },
      snakeContext,
    ),
  );
}

export const gamePlugin = createGamePlugin<SnakeState, SnakeInputPayload>({
  central: SnakeCentralView,
  createInitialState() {
    return createInitialSnakeEngineState([], snakeContext).publicState;
  },
  manifest: {
    description: "Realtime Snake with authoritative ticks, reconnect respawn and canvas central view.",
    displayName: "Snake",
    id: "snake",
    supportsTeams: false,
    tickHz: snakeContext.tickHz,
    version: "0.2.0",
  },
  mobile: SnakeMobileView,
  parseInput(message) {
    return parseInput(message);
  },
  server: {
    onGameStart(api) {
      applyState(
        api,
        reduceSnakeEngineState(
          runtimeState,
          {
            players: api.getPlayers(),
            type: "game_started",
          },
          snakeContext,
        ),
      );
      api.log("info", "snake_started", "Snake round started.", {
        gridHeight: snakeContext.gridHeight,
        gridWidth: snakeContext.gridWidth,
        tickHz: snakeContext.tickHz,
      });
    },
    onGameStop(api) {
      applyState(
        api,
        reduceSnakeEngineState(
          runtimeState,
          {
            players: api.getPlayers(),
            type: "game_stopped",
          },
          snakeContext,
        ),
      );
      api.log("info", "snake_stopped", "Snake round stopped.", {});
    },
    onInput(api, input) {
      if (input.action === SNAKE_DIRECTION_ACTION && input.payload !== undefined && "dir" in input.payload) {
        applyState(
          api,
          reduceSnakeEngineState(
            runtimeState,
            {
              dir: input.payload.dir,
              playerId: input.playerId,
              players: api.getPlayers(),
              type: "direction_received",
            },
            snakeContext,
          ),
        );
        return;
      }

      if (input.action === SNAKE_RESTART_ACTION) {
        applyState(
          api,
          reduceSnakeEngineState(
            runtimeState,
            {
              players: api.getPlayers(),
              type: "restart_requested",
            },
            snakeContext,
          ),
        );
        api.log("info", "snake_restarted", "Snake round restarted by host action.", {});
      }
    },
    onPlayerJoin(api) {
      syncPlayers(api);
    },
    onPlayerLeave(api) {
      syncPlayers(api);
    },
    onPlayerReconnect(api, player) {
      const previousSnake = runtimeState.publicState.snakes.find(
        (candidate) => candidate.playerId === player.playerId,
      );
      const previousStage = runtimeState.publicState.stage;

      applyState(
        api,
        reduceSnakeEngineState(
          runtimeState,
          {
            playerId: player.playerId,
            players: api.getPlayers(),
            type: "player_reconnected",
          },
          snakeContext,
        ),
      );

      const nextSnake = runtimeState.publicState.snakes.find(
        (candidate) => candidate.playerId === player.playerId,
      );

      if (previousStage === "running" && previousSnake?.alive !== true && nextSnake?.alive === true) {
        api.log("info", "snake_respawned", `${player.name} respawned after reconnect.`, {
          playerId: player.playerId,
        });
      }
    },
    onSessionCreated(api) {
      runtimeState = createInitialSnakeEngineState(api.getPlayers(), snakeContext);
      api.setState(runtimeState.publicState);
      api.log("info", "snake_session_created", "Snake plugin attached to session.", {
        tickHz: snakeContext.tickHz,
      });
    },
    onTick(api) {
      const previousStage = runtimeState.publicState.stage;
      const previousWinnerPlayerId = runtimeState.publicState.winnerPlayerId;

      applyState(
        api,
        reduceSnakeEngineState(
          runtimeState,
          {
            players: api.getPlayers(),
            type: "tick",
          },
          snakeContext,
        ),
      );

      if (
        previousStage !== "game_over" &&
        runtimeState.publicState.stage === "game_over" &&
        runtimeState.publicState.winnerPlayerId !== previousWinnerPlayerId
      ) {
        api.log("info", "snake_round_finished", "Snake round finished.", {
          winnerPlayerId: runtimeState.publicState.winnerPlayerId,
        });
      }
    },
  },
});

function resolvePlayerName(snakes: SnakePlayerState[], playerId: string | null): string {
  if (playerId === null) {
    return "Nobody";
  }

  return snakes.find((snake) => snake.playerId === playerId)?.name ?? playerId;
}

function withAlpha(hexColor: string, alpha: number): string {
  const normalized = hexColor.replace("#", "");

  if (normalized.length !== 6) {
    return hexColor;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return hexColor;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export const manifest = gamePlugin.manifest;
export default gamePlugin;
export type { SnakeActionPayload, SnakeDirectionPayload, SnakeInputPayload, SnakePoint };
