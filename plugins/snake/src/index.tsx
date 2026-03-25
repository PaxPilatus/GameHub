import { useEffect, useRef, useState } from "react";

import type { InputMessage } from "@game-hub/protocol";
import {
  createGamePlugin,
  type GameCentralProps,
  type GameControlsResolverContext,
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
  const state = asSnakeState(props.gameState);
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
            Relay {props.hubSession?.relayStatus ?? "pending"} / phase {props.phase}
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
        <span>Grid {state?.grid.width ?? snakeContext.gridWidth} x {state?.grid.height ?? snakeContext.gridHeight}</span>
        <span>Tick {state?.tick ?? 0}</span>
        <span>Alive {state?.aliveCount ?? 0}</span>
      </div>
    </div>
  );
}

interface SnakeCanvasSize {
  height: number;
  width: number;
}

function SnakeCentralView(props: GameCentralProps<SnakeState>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const state = asSnakeState(props.gameState);
  const [canvasSize, setCanvasSize] = useState<SnakeCanvasSize>({
    height: snakeContext.gridHeight * 18,
    width: snakeContext.gridWidth * 18,
  });

  useEffect(() => {
    const stage = stageRef.current;

    if (stage === null) {
      return;
    }

    const gridWidth = state?.grid.width ?? snakeContext.gridWidth;
    const gridHeight = state?.grid.height ?? snakeContext.gridHeight;
    const updateCanvasSize = () => {
      const styles = window.getComputedStyle(stage);
      const availableWidth = Math.max(
        0,
        stage.clientWidth -
          Number.parseFloat(styles.paddingLeft) -
          Number.parseFloat(styles.paddingRight),
      );
      const availableHeight = Math.max(
        0,
        stage.clientHeight -
          Number.parseFloat(styles.paddingTop) -
          Number.parseFloat(styles.paddingBottom),
      );
      const nextSize = fitSnakeCanvasToViewport(
        availableWidth,
        availableHeight,
        gridWidth,
        gridHeight,
      );

      setCanvasSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize,
      );
    };

    updateCanvasSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateCanvasSize();
    });
    observer.observe(stage);

    return () => {
      observer.disconnect();
    };
  }, [state?.grid.height, state?.grid.width]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (
      canvas === null ||
      state === null ||
      canvasSize.width <= 0 ||
      canvasSize.height <= 0
    ) {
      return;
    }

    const context = canvas.getContext("2d");

    if (context === null) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const displayWidth = canvasSize.width;
    const displayHeight = canvasSize.height;
    const cellWidth = displayWidth / state.grid.width;
    const cellHeight = displayHeight / state.grid.height;
    const inset = Math.max(1, Math.min(cellWidth, cellHeight) * 0.08);

    canvas.width = Math.floor(displayWidth * pixelRatio);
    canvas.height = Math.floor(displayHeight * pixelRatio);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, displayWidth, displayHeight);
    context.fillStyle = "#09131b";
    context.fillRect(0, 0, displayWidth, displayHeight);
    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;

    for (let x = 0; x <= state.grid.width; x += 1) {
      const xOffset = x * cellWidth;
      context.beginPath();
      context.moveTo(xOffset + 0.5, 0);
      context.lineTo(xOffset + 0.5, displayHeight);
      context.stroke();
    }

    for (let y = 0; y <= state.grid.height; y += 1) {
      const yOffset = y * cellHeight;
      context.beginPath();
      context.moveTo(0, yOffset + 0.5);
      context.lineTo(displayWidth, yOffset + 0.5);
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
          segment.x * cellWidth + inset,
          segment.y * cellHeight + inset,
          Math.max(1, cellWidth - inset * 2),
          Math.max(1, cellHeight - inset * 2),
        );
      }
    }
  }, [canvasSize.height, canvasSize.width, state]);

  return (
    <div className="snake-central-stage">
      <div ref={stageRef} className="snake-canvas-stage">
        <canvas ref={canvasRef} className="snake-canvas" />
        <div className="snake-stage-overlay">
          <strong>{resolveSnakeCentralMessage(state)}</strong>
          <span>
            {state?.stage ?? "lobby"} / {state?.tickHz ?? snakeContext.tickHz} Hz / {state?.aliveCount ?? 0} alive
          </span>
        </div>
      </div>
    </div>
  );
}

function buildSnakeControls(
  context: GameControlsResolverContext<SnakeState>,
) {
  const state = asSnakeState(context.gameState);
  const playerSnake =
    context.playerId === null || state === null
      ? null
      : state.snakes.find((snake) => snake.playerId === context.playerId) ?? null;
  const controlsEnabled =
    state?.stage === "running" &&
    context.phase === "game_running" &&
    playerSnake?.alive === true;

  return {
    controls: [
      {
        kind: "notice" as const,
        text:
          state === null
            ? "Snake state pending."
            : controlsEnabled
              ? "Use the D-pad. The latest direction before the next tick wins."
              : state.stage === "game_over"
                ? state.latestMessage
                : "Controls unlock once the host starts the next round.",
      },
      {
        action: SNAKE_DIRECTION_ACTION,
        disabled: !controlsEnabled,
        kind: "dpad" as const,
      },
    ],
  };
}

function publishSnakeHubState(api: GameHostApi<SnakeState>): void {
  api.ui.publishStatusBadges([
    {
      id: "snake-stage",
      label: "Stage",
      value: runtimeState.publicState.stage,
    },
    {
      id: "snake-grid",
      label: "Grid",
      value: `${runtimeState.publicState.grid.width}x${runtimeState.publicState.grid.height}`,
    },
    {
      id: "snake-alive",
      label: "Alive",
      value: String(runtimeState.publicState.aliveCount),
    },
  ]);

  for (const snake of runtimeState.publicState.snakes) {
    const status = !snake.connected
      ? "offline"
      : runtimeState.publicState.stage === "running"
        ? snake.alive
          ? "alive"
          : "dead"
        : "spectating";
    api.results.setPlayerStatus(snake.playerId, status);
  }

  if (runtimeState.publicState.stage === "game_over") {
    api.ui.setOverlay({
      message: runtimeState.publicState.latestMessage,
      title: "Snake round finished",
      tone: runtimeState.publicState.winnerPlayerId === null ? "info" : "success",
    });
    return;
  }

  api.ui.clearOverlay();
}
function fitSnakeCanvasToViewport(
  availableWidth: number,
  availableHeight: number,
  gridWidth: number,
  gridHeight: number,
): SnakeCanvasSize {
  if (availableWidth <= 0 || availableHeight <= 0 || gridWidth <= 0 || gridHeight <= 0) {
    return {
      height: gridHeight,
      width: gridWidth,
    };
  }

  const widthLimitedHeight = availableWidth * (gridHeight / gridWidth);

  if (widthLimitedHeight <= availableHeight) {
    return {
      height: Math.max(1, Math.floor(widthLimitedHeight)),
      width: Math.max(1, Math.floor(availableWidth)),
    };
  }

  return {
    height: Math.max(1, Math.floor(availableHeight)),
    width: Math.max(1, Math.floor(availableHeight * (gridWidth / gridHeight))),
  };
}

function resolveSnakeCentralMessage(state: SnakeState | null): string {
  if (state === null) {
    return "Snake state pending.";
  }

  if (state.stage === "game_over") {
    return state.winnerPlayerId === null
      ? "Round ended in a draw."
      : `${resolvePlayerName(state.snakes, state.winnerPlayerId)} won the round.`;
  }

  return state.latestMessage;
}

interface DirectionButtonProps {
  direction: SnakeDirection;
  disabled: boolean;
  onPress(): void;
}

function DirectionButton(props: DirectionButtonProps) {
  const labels: Record<SnakeDirection, string> = {
    down: "?",
    left: "?",
    right: "?",
    up: "?",
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
  controls: buildSnakeControls,
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
      publishSnakeHubState(api);
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
      publishSnakeHubState(api);
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
        publishSnakeHubState(api);
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
        publishSnakeHubState(api);
        api.log("info", "snake_restarted", "Snake round restarted by host action.", {});
      }
    },
    onPlayerJoin(api) {
      syncPlayers(api);
      publishSnakeHubState(api);
    },
    onPlayerLeave(api) {
      syncPlayers(api);
      publishSnakeHubState(api);
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

      publishSnakeHubState(api);
    },
    onSessionCreated(api) {
      runtimeState = createInitialSnakeEngineState(api.getPlayers(), snakeContext);
      api.results.clearLeaderboard();
      api.setState(runtimeState.publicState);
      publishSnakeHubState(api);
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
        if (runtimeState.publicState.winnerPlayerId !== null) {
          api.results.recordPlayerWin(runtimeState.publicState.winnerPlayerId);
        }
        api.results.endRound({
          message: runtimeState.publicState.latestMessage,
          title: "Snake round finished",
        });
        api.log("info", "snake_round_finished", "Snake round finished.", {
          winnerPlayerId: runtimeState.publicState.winnerPlayerId,
        });
      }

      publishSnakeHubState(api);
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

function asSnakeState(value: unknown): SnakeState | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!isSnakeGrid(value.grid) || !Array.isArray(value.snakes)) {
    return null;
  }

  if (!value.snakes.every((snake) => isSnakePlayerState(snake))) {
    return null;
  }

  if (
    value.stage !== "lobby" &&
    value.stage !== "running" &&
    value.stage !== "game_over"
  ) {
    return null;
  }

  return value as SnakeState;
}

function isSnakeGrid(value: unknown): value is SnakeState["grid"] {
  return (
    isRecord(value) &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

function isSnakePlayerState(value: unknown): value is SnakePlayerState {
  return (
    isRecord(value) &&
    typeof value.playerId === "string" &&
    typeof value.name === "string" &&
    typeof value.team === "string" &&
    typeof value.connected === "boolean" &&
    typeof value.alive === "boolean" &&
    typeof value.direction === "string" &&
    typeof value.color === "string" &&
    typeof value.wins === "number" &&
    Array.isArray(value.segments) &&
    value.segments.every((segment) => isSnakePoint(segment))
  );
}

function isSnakePoint(value: unknown): value is SnakePoint {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}



