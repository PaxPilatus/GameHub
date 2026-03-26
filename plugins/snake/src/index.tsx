import { useEffect, useRef, useState } from "react";

import type { InputMessage } from "@game-hub/protocol";
import {
  createGamePlugin,
  type GameCentralProps,
  type GameControlsResolverContext,
  type GameHostApi,
  type GameMobileProps,
  type GamePlayerSnapshot,
} from "@game-hub/sdk";

import {
  SNAKE_DEFAULT_TICK_HZ,
  SNAKE_DIRECTION_ACTION,
  SNAKE_EFFECT_ACTION,
  SNAKE_ITEMS_CONFIG_ACTION,
  SNAKE_MODE_CONFIG_ACTION,
  SNAKE_RESTART_ACTION,
  SNAKE_SECRET_QUESTS_CONFIG_ACTION,
  createInitialSnakeEngineState,
  createSnakeContext,
  reduceSnakeEngineState,
  type SnakeCoin,
  type SnakeCoinrushState,
  type SnakeDirection,
  type SnakeEngineState,
  type SnakeFood,
  type SnakeItem,
  type SnakeItemSettings,
  type SnakePlayerState,
  type SnakePoint,
  type SnakeRoundMode,
  type SnakeSecretQuestLiveEntry,
  type SnakeSecretQuestRoundSummaryEntry,
  type SnakeSecretQuestSettings,
  type SnakeState,
} from "./reducer.js";

interface SnakeDirectionPayload {
  dir: SnakeDirection;
}

interface SnakeActionPayload {
  type: "boost";
}

type SnakeItemsConfigPayload = Partial<SnakeItemSettings>;
interface SnakeModeConfigPayload {
  mode: SnakeRoundMode;
}

interface SnakeSecretQuestsConfigPayload {
  enabled: boolean;
}

type SnakeInputPayload =
  | SnakeDirectionPayload
  | SnakeActionPayload
  | SnakeItemsConfigPayload
  | SnakeModeConfigPayload
  | SnakeSecretQuestsConfigPayload
  | undefined;

const DEFAULT_ITEM_SETTINGS: SnakeItemSettings = {
  boost: true,
  magnet: true,
  shield: true,
};

const DEFAULT_SECRET_QUEST_SETTINGS: SnakeSecretQuestSettings = {
  enabled: false,
};

const SNAKE_ITEM_SPRITE_URLS: Record<SnakeItem["type"], string> = {
  boost: new URL("../assets/Speed.png", import.meta.url).href,
  magnet: new URL("../assets/Magnet.png", import.meta.url).href,
  shield: new URL("../assets/Schild.png", import.meta.url).href,
};

const SNAKE_COIN_SPRITE_URLS: Record<SnakeCoin["type"], string> = {
  gold: new URL("../assets/big Coin.png", import.meta.url).href,
  normal: new URL("../assets/normal Coin.png", import.meta.url).href,
};

type SnakeSpriteStatus = "loading" | "ready" | "error";

interface SnakeSpriteCacheEntry {
  image: HTMLImageElement;
  status: SnakeSpriteStatus;
}

type SnakeSpriteLoadListener = () => void;

const snakeSpriteCache = new Map<string, SnakeSpriteCacheEntry>();
const snakeSpriteLoadListeners = new Set<SnakeSpriteLoadListener>();
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

  const effects = playerSnake?.activeEffects ?? [];
  const shieldEffect = effects.find((effect) => effect.type === "shield");
  const isCoinrush = state?.roundMode === "coinrush";
  const scoreLabel = isCoinrush ? "Coins" : "Score";
  const scoreValue = isCoinrush ? (playerSnake?.coinCount ?? 0) : (playerSnake?.score ?? 0);
  const playerQuest =
    props.playerId === null || state === null || state.secretQuestLive === null
      ? null
      : state.secretQuestLive.find((entry) => entry.playerId === props.playerId) ?? null;

  return (
    <div className="plugin-stack snake-mobile-stack">
      <div className="snake-banner">
        <div>
          <strong>{resolveSnakeMobileMessage(state)}</strong>
          <span>
            Relay {props.hubSession?.relayStatus ?? "pending"} / phase {props.phase}
          </span>
        </div>
        <div className="snake-mobile-meta">
          <span>{playerSnake?.alive === true ? "alive" : "spectating"}</span>
          <span>{scoreLabel} {scoreValue}</span>
          <span>{playerSnake?.wins ?? 0} wins</span>
        </div>
      </div>

      <div className="snake-mobile-board-copy">
        <strong>{playerSnake?.name ?? "Player"}</strong>
        <span>
          {controlsEnabled
            ? "Tap a direction. Last input before the next tick wins."
            : state?.stage === "running"
              ? "Respawn runs automatically after elimination."
              : "Controls unlock once the host starts the round."}
        </span>
        <div className="snake-mobile-effects">
          <span>
            Shield {shieldEffect?.charges ?? 0} / {formatEffectTicks(shieldEffect?.ticksRemaining ?? 0, state?.tickHz ?? snakeContext.tickHz)}
          </span>
          {effects
            .filter((effect) => effect.type !== "shield")
            .map((effect) => (
              <span key={`${effect.type}-${effect.ticksRemaining}`}>
                {effect.type} {formatEffectTicks(effect.ticksRemaining, state?.tickHz ?? snakeContext.tickHz)}
              </span>
            ))}
          {effects.length === 0 ? <span>No active item effects.</span> : null}
        </div>
      </div>

      <div className="snake-mobile-board-copy snake-mobile-quest-card">
        <strong>Secret Quest</strong>
        <span>{resolveSnakeMobileQuestMessage(state, props.playerId, playerQuest)}</span>
        {state?.stage === "running" && playerQuest !== null ? (
          <div className="snake-mobile-effects">
            <span>{resolveSnakeSecretQuestLabel(playerQuest.questType)}</span>
            <span>{formatSnakeSecretQuestProgress(playerQuest, state.tickHz)}</span>
            <span>Status {playerQuest.status}</span>
          </div>
        ) : null}
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
        <span>
          Grid {state?.grid.width ?? snakeContext.gridWidth} x {state?.grid.height ?? snakeContext.gridHeight}
        </span>
        <span>Mode {formatRoundModeLabel(state?.roundMode ?? "standard")}</span>
        <span>Tick {state?.tick ?? 0}</span>
        <span>Alive {state?.aliveCount ?? 0}</span>
        <span>Items {state?.items.length ?? 0}</span>
        <span>Coins {state?.coins.length ?? 0}</span>
        <span>
          Secret Quest {state?.secretQuestSettings.enabled ? "active" : "off"}
        </span>
        {state?.roundMode === "coinrush" && state.coinrush !== null ? (
          <span>{resolveCoinrushWaveLabel(state.coinrush, state.tickHz)}</span>
        ) : null}
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
  const [spriteVersion, setSpriteVersion] = useState(0);
  const [canvasSize, setCanvasSize] = useState<SnakeCanvasSize>({
    height: snakeContext.gridHeight * 18,
    width: snakeContext.gridWidth * 18,
  });

  const canEditItems = state?.stage === "lobby" || state?.stage === "countdown";
  const canEditMode = canEditItems;
  const canEditSecretQuests = canEditItems;
  const itemSettings = state?.itemSettings ?? DEFAULT_ITEM_SETTINGS;
  const roundMode = state?.roundMode ?? "standard";
  const secretQuestSettings = state?.secretQuestSettings ?? DEFAULT_SECRET_QUEST_SETTINGS;
  const countdownOverlayText = resolveSnakeCountdownOverlayText(state);

  useEffect(() => {
    preloadSnakeSprites();
    return subscribeSnakeSpriteLoads(() => {
      setSpriteVersion((current) => current + 1);
    });
  }, []);

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
        stage.clientWidth - Number.parseFloat(styles.paddingLeft) - Number.parseFloat(styles.paddingRight),
      );
      const availableHeight = Math.max(
        0,
        stage.clientHeight - Number.parseFloat(styles.paddingTop) - Number.parseFloat(styles.paddingBottom),
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

    if (canvas === null || state === null || canvasSize.width <= 0 || canvasSize.height <= 0) {
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

    drawCoinrushHotspots(context, state.coinrush, cellWidth, cellHeight);
    drawFoods(context, state.foods, cellWidth, cellHeight, inset);
    drawCoins(context, state.coins, cellWidth, cellHeight, inset);
    drawItems(context, state.items, cellWidth, cellHeight, inset);
    drawSnakes(context, state, cellWidth, cellHeight, inset);
  }, [canvasSize.height, canvasSize.width, spriteVersion, state]);

  return (
    <div className="snake-central-stage">
      <div className="snake-central-toolbar">
        <div className="snake-mode-toggle-group">
          <button
            type="button"
            className={`snake-item-toggle ${roundMode === "standard" ? "snake-item-toggle-enabled" : ""}`}
            disabled={!canEditMode}
            onClick={() => {
              void props.invokeHostAction(SNAKE_MODE_CONFIG_ACTION, { mode: "standard" });
            }}
          >
            Standard
          </button>
          <button
            type="button"
            className={`snake-item-toggle ${roundMode === "coinrush" ? "snake-item-toggle-enabled" : ""}`}
            disabled={!canEditMode}
            onClick={() => {
              void props.invokeHostAction(SNAKE_MODE_CONFIG_ACTION, { mode: "coinrush" });
            }}
          >
            Coinrush
          </button>
        </div>
        <div className="snake-item-toggle-group">
          <button
            type="button"
            className={`snake-item-toggle ${itemSettings.boost ? "snake-item-toggle-enabled" : ""}`}
            disabled={!canEditItems}
            onClick={() => {
              void props.invokeHostAction(SNAKE_ITEMS_CONFIG_ACTION, { boost: !itemSettings.boost });
            }}
          >
            Boost
          </button>
          <button
            type="button"
            className={`snake-item-toggle ${itemSettings.magnet ? "snake-item-toggle-enabled" : ""}`}
            disabled={!canEditItems}
            onClick={() => {
              void props.invokeHostAction(SNAKE_ITEMS_CONFIG_ACTION, { magnet: !itemSettings.magnet });
            }}
          >
            Magnet
          </button>
          <button
            type="button"
            className={`snake-item-toggle ${itemSettings.shield ? "snake-item-toggle-enabled" : ""}`}
            disabled={!canEditItems}
            onClick={() => {
              void props.invokeHostAction(SNAKE_ITEMS_CONFIG_ACTION, { shield: !itemSettings.shield });
            }}
          >
            Shield
          </button>
        </div>
        <div className="snake-item-toggle-group">
          <button
            type="button"
            className={`snake-item-toggle ${secretQuestSettings.enabled ? "snake-item-toggle-enabled" : ""}`}
            disabled={!canEditSecretQuests}
            onClick={() => {
              void props.invokeHostAction(SNAKE_SECRET_QUESTS_CONFIG_ACTION, {
                enabled: !secretQuestSettings.enabled,
              });
            }}
          >
            Secret Quests
          </button>
        </div>
        <div className="snake-toolbar-hints">
          <span className="snake-item-toggle-hint">
            {canEditMode
              ? "Mode editable in lobby/countdown"
              : `Round-frozen mode: ${formatRoundModeLabel(roundMode)}`}
          </span>
          <span className="snake-item-toggle-hint">
            {canEditItems
              ? "Items editable in lobby/countdown"
              : `Round-frozen items: ${formatEnabledItemTypes(itemSettings)}`}
          </span>
          <span className="snake-item-toggle-hint">
            {canEditSecretQuests
              ? "Secret quests editable in lobby/countdown"
              : `Round-frozen secret quests: ${secretQuestSettings.enabled ? "on" : "off"}`}
          </span>
          <span className="snake-item-toggle-hint">{resolveSnakeCentralSecretQuestHint(state)}</span>
          <span className="snake-item-toggle-hint">Icons: bolt boost / U magnet / S shield</span>
          <span className="snake-item-toggle-hint">Collectibles: coin 1 / gold 3 / hotspot H (zone only)</span>
        </div>
      </div>
      <div ref={stageRef} className="snake-canvas-stage">
        <canvas ref={canvasRef} className="snake-canvas" />
        {countdownOverlayText === null ? null : (
          <div className="snake-countdown-overlay">
            <strong className="snake-countdown-pill">{countdownOverlayText}</strong>
          </div>
        )}
        <div className="snake-stage-overlay">
          <strong>{resolveSnakeCentralMessage(state)}</strong>
          <span>
            {state === null ? `lobby / ${snakeContext.tickHz} Hz` : resolveSnakeOverlayMeta(state)}
          </span>
        </div>
      </div>
    </div>
  );
}

function buildSnakeControls(context: GameControlsResolverContext<SnakeState>) {
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
  const enabledTypes = formatEnabledItemTypes(runtimeState.publicState.itemSettings);
  const modeLabel = formatRoundModeLabel(runtimeState.publicState.roundMode);
  const badges = [
    {
      id: "snake-stage",
      label: "Stage",
      value: runtimeState.publicState.stage,
    },
    {
      id: "snake-mode",
      label: "Mode",
      value: modeLabel,
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
    {
      id: "snake-items",
      label: "Items",
      value: `${runtimeState.publicState.items.length} (${enabledTypes})`,
    },
    {
      id: "snake-secret-quests",
      label: "Secret Quests",
      value:
        runtimeState.publicState.stage === "running" || runtimeState.publicState.stage === "game_over"
          ? `frozen ${runtimeState.publicState.secretQuestSettings.enabled ? "on" : "off"}`
          : runtimeState.publicState.secretQuestSettings.enabled
            ? "on"
            : "off",
    },
    {
      id: "snake-coins",
      label: "Coins",
      value: String(runtimeState.publicState.coins.length),
    },
  ];

  if (runtimeState.publicState.roundMode === "coinrush" && runtimeState.publicState.coinrush !== null) {
    badges.push({
      id: "snake-coinrush-wave",
      label: "Wave",
      value: resolveCoinrushWaveLabel(runtimeState.publicState.coinrush, runtimeState.publicState.tickHz),
    });
  }

  api.ui.publishStatusBadges(badges);

  const useCoins = runtimeState.publicState.roundMode === "coinrush";
  for (const snake of runtimeState.publicState.snakes) {
    const status = !snake.connected
      ? "offline"
      : runtimeState.publicState.stage === "running"
        ? snake.alive
          ? "alive"
          : snake.respawnTicksRemaining !== null
            ? "respawning"
            : "dead"
        : "spectating";
    api.results.setPlayerStatus(snake.playerId, status);
    api.results.setPlayerScore(snake.playerId, useCoins ? snake.coinCount : snake.score);
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

function drawFoods(
  context: CanvasRenderingContext2D,
  foods: SnakeFood[],
  cellWidth: number,
  cellHeight: number,
  inset: number,
): void {
  const radius = Math.max(1, Math.min(cellWidth, cellHeight) * 0.28);
  for (const food of foods) {
    context.fillStyle = food.source === "drop" ? "#ff9f6e" : "#f7d154";
    context.beginPath();
    context.arc(
      food.point.x * cellWidth + cellWidth / 2,
      food.point.y * cellHeight + cellHeight / 2,
      radius,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.strokeStyle = "rgba(8, 16, 24, 0.55)";
    context.lineWidth = Math.max(1, inset * 0.4);
    context.stroke();
  }
}

function drawCoins(
  context: CanvasRenderingContext2D,
  coins: SnakeCoin[],
  cellWidth: number,
  cellHeight: number,
  inset: number,
): void {
  for (const coin of coins) {
    const centerX = coin.point.x * cellWidth + cellWidth / 2;
    const centerY = coin.point.y * cellHeight + cellHeight / 2;
    const sprite = getSnakeSprite(resolveCoinSpriteUrl(coin.type));
    if (sprite !== null) {
      const diameter = Math.max(1, Math.min(cellWidth, cellHeight) * (coin.type === "gold" ? 0.9 : 0.82));
      drawSpriteInsideTile(
        context,
        sprite,
        centerX - diameter / 2,
        centerY - diameter / 2,
        diameter,
        diameter,
      );
      continue;
    }

    const radius = coin.type === "gold"
      ? Math.max(1, Math.min(cellWidth, cellHeight) * 0.33)
      : Math.max(1, Math.min(cellWidth, cellHeight) * 0.26);
    context.fillStyle = coin.type === "gold" ? "#ffd166" : "#87d8ff";
    context.beginPath();
    context.arc(
      centerX,
      centerY,
      radius,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.strokeStyle = coin.type === "gold" ? "rgba(255, 240, 198, 0.95)" : "rgba(205, 234, 252, 0.9)";
    context.lineWidth = Math.max(1, inset * 0.45);
    context.stroke();
    drawCenteredGlyph(
      context,
      centerX,
      centerY,
      coin.type === "gold" ? "3" : "1",
      Math.max(7, radius * 1.5),
      "rgba(9, 19, 27, 0.92)",
      "rgba(255, 255, 255, 0.88)",
    );
  }
}

function drawCoinrushHotspots(
  context: CanvasRenderingContext2D,
  coinrush: SnakeCoinrushState | null,
  cellWidth: number,
  cellHeight: number,
): void {
  if (coinrush === null) {
    return;
  }

  const drawHotspots = (
    hotspots: SnakePoint[],
    fillColor: string,
    strokeColor: string,
    alpha: number,
  ) => {
    for (const hotspot of hotspots) {
      const left = hotspot.x * cellWidth;
      const top = hotspot.y * cellHeight;
      const dash = Math.max(2, Math.round(Math.min(cellWidth, cellHeight) * 0.14));
      context.save();
      context.fillStyle = fillColor;
      context.globalAlpha = alpha;
      context.fillRect(
        left,
        top,
        cellWidth,
        cellHeight,
      );
      context.restore();
      context.save();
      context.strokeStyle = strokeColor;
      context.lineWidth = Math.max(1, Math.min(cellWidth, cellHeight) * 0.08);
      context.setLineDash([dash, dash]);
      context.strokeRect(
        left + 0.5,
        top + 0.5,
        Math.max(0, cellWidth - 1),
        Math.max(0, cellHeight - 1),
      );
      context.restore();
      drawCenteredGlyph(
        context,
        left + cellWidth / 2,
        top + cellHeight / 2,
        "H",
        Math.max(7, Math.min(cellWidth, cellHeight) * 0.48),
        "rgba(9, 19, 27, 0.92)",
        "rgba(255, 255, 255, 0.72)",
      );
    }
  };

  drawHotspots(coinrush.announcedHotspots, "#4cc9f0", "rgba(116, 220, 248, 0.9)", 0.14);
  drawHotspots(coinrush.activeHotspots, "#ffd166", "rgba(255, 220, 132, 0.95)", 0.22);
}

function drawCenteredGlyph(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  glyph: string,
  fontSize: number,
  fillStyle: string,
  strokeStyle: string,
): void {
  context.save();
  context.font = `800 ${fontSize}px "Segoe UI", "Inter", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = Math.max(1, fontSize * 0.22);
  context.strokeStyle = strokeStyle;
  context.strokeText(glyph, centerX, centerY);
  context.fillStyle = fillStyle;
  context.fillText(glyph, centerX, centerY);
  context.restore();
}
function drawItems(
  context: CanvasRenderingContext2D,
  items: SnakeItem[],
  cellWidth: number,
  cellHeight: number,
  inset: number,
): void {
  for (const item of items) {
    const tileLeft = item.point.x * cellWidth + inset;
    const tileTop = item.point.y * cellHeight + inset;
    const tileWidth = Math.max(1, cellWidth - inset * 2);
    const tileHeight = Math.max(1, cellHeight - inset * 2);
    const centerX = tileLeft + tileWidth / 2;
    const centerY = tileTop + tileHeight / 2;
    const glyphSize = Math.max(6, Math.min(tileWidth, tileHeight));
    const sprite = getSnakeSprite(resolveItemSpriteUrl(item.type));

    if (sprite !== null) {
      context.fillStyle = withAlpha(resolveItemColor(item.type), 0.2);
      context.fillRect(tileLeft, tileTop, tileWidth, tileHeight);
      context.strokeStyle = "rgba(255, 255, 255, 0.3)";
      context.lineWidth = Math.max(1, inset * 0.45);
      context.strokeRect(tileLeft, tileTop, tileWidth, tileHeight);
      drawSpriteInsideTile(
        context,
        sprite,
        tileLeft,
        tileTop,
        tileWidth,
        tileHeight,
        Math.max(1, Math.min(tileWidth, tileHeight) * 0.06),
      );
      continue;
    }

    context.fillStyle = resolveItemColor(item.type);
    context.fillRect(tileLeft, tileTop, tileWidth, tileHeight);
    context.strokeStyle = "rgba(255, 255, 255, 0.35)";
    context.lineWidth = Math.max(1, inset * 0.45);
    context.strokeRect(tileLeft, tileTop, tileWidth, tileHeight);
    drawItemGlyph(context, item.type, centerX, centerY, glyphSize);
  }
}

function drawSnakes(
  context: CanvasRenderingContext2D,
  state: SnakeState,
  cellWidth: number,
  cellHeight: number,
  inset: number,
): void {
  for (const snake of state.snakes) {
    for (let index = 0; index < snake.segments.length; index += 1) {
      const segment = snake.segments[index];

      if (segment === undefined) {
        continue;
      }

      const alpha = snake.alive ? 0.8 : 0.35;
      context.fillStyle = index === 0 ? snake.color : withAlpha(snake.color, alpha);
      context.fillRect(
        segment.x * cellWidth + inset,
        segment.y * cellHeight + inset,
        Math.max(1, cellWidth - inset * 2),
        Math.max(1, cellHeight - inset * 2),
      );

      if (index === 0 && snake.spawnProtectionTicksRemaining > 0) {
        context.strokeStyle = "rgba(126, 231, 135, 0.95)";
        context.lineWidth = Math.max(1, inset * 0.6);
        context.strokeRect(
          segment.x * cellWidth + inset,
          segment.y * cellHeight + inset,
          Math.max(1, cellWidth - inset * 2),
          Math.max(1, cellHeight - inset * 2),
        );
      }
    }

    if (!state.showIdentityLabels || !snake.alive || snake.head === null) {
      continue;
    }
    drawSnakeIdentityLabel(context, snake, state, cellWidth, cellHeight);
  }
}

function drawItemGlyph(
  context: CanvasRenderingContext2D,
  type: SnakeItem["type"],
  centerX: number,
  centerY: number,
  size: number,
): void {
  const iconSize = Math.max(5, size * 0.5);

  context.save();
  context.translate(centerX, centerY);
  context.lineCap = "round";
  context.lineJoin = "round";

  switch (type) {
    case "boost": {
      context.beginPath();
      context.moveTo(iconSize * -0.28, iconSize * -0.5);
      context.lineTo(iconSize * 0.1, iconSize * -0.05);
      context.lineTo(iconSize * -0.02, iconSize * -0.05);
      context.lineTo(iconSize * 0.24, iconSize * 0.5);
      context.lineTo(iconSize * -0.12, iconSize * 0.08);
      context.lineTo(iconSize * 0.02, iconSize * 0.08);
      context.closePath();
      context.fillStyle = "rgba(9, 19, 27, 0.88)";
      context.fill();
      context.strokeStyle = "rgba(255, 255, 255, 0.88)";
      context.lineWidth = Math.max(1, iconSize * 0.11);
      context.stroke();
      break;
    }
    case "magnet": {
      context.strokeStyle = "rgba(9, 19, 27, 0.9)";
      context.lineWidth = Math.max(1.4, iconSize * 0.2);
      context.beginPath();
      context.moveTo(iconSize * -0.42, iconSize * -0.34);
      context.lineTo(iconSize * -0.42, iconSize * 0.15);
      context.arc(0, iconSize * 0.15, iconSize * 0.42, Math.PI, 0, false);
      context.lineTo(iconSize * 0.42, iconSize * -0.34);
      context.stroke();

      context.fillStyle = "rgba(255, 255, 255, 0.92)";
      context.fillRect(iconSize * -0.56, iconSize * -0.5, iconSize * 0.24, iconSize * 0.2);
      context.fillRect(iconSize * 0.32, iconSize * -0.5, iconSize * 0.24, iconSize * 0.2);
      break;
    }
    case "shield":
    default: {
      context.beginPath();
      context.moveTo(0, iconSize * -0.54);
      context.lineTo(iconSize * 0.45, iconSize * -0.2);
      context.lineTo(iconSize * 0.3, iconSize * 0.32);
      context.lineTo(0, iconSize * 0.56);
      context.lineTo(iconSize * -0.3, iconSize * 0.32);
      context.lineTo(iconSize * -0.45, iconSize * -0.2);
      context.closePath();
      context.fillStyle = "rgba(9, 19, 27, 0.88)";
      context.fill();
      context.strokeStyle = "rgba(255, 255, 255, 0.88)";
      context.lineWidth = Math.max(1, iconSize * 0.1);
      context.stroke();
      break;
    }
  }

  context.restore();
}

function drawSnakeIdentityLabel(
  context: CanvasRenderingContext2D,
  snake: SnakeState["snakes"][number],
  state: SnakeState,
  cellWidth: number,
  cellHeight: number,
): void {
  if (snake.head === null) {
    return;
  }

  const label = snake.name.trim() === "" ? snake.playerId : snake.name;
  const fontSize = Math.max(16, Math.min(32, Math.floor(Math.min(cellWidth, cellHeight) * 0.84)));
  const boardWidth = state.grid.width * cellWidth;
  const boardHeight = state.grid.height * cellHeight;
  const rawX = snake.head.x * cellWidth + cellWidth / 2;
  const aboveY = snake.head.y * cellHeight - fontSize * 0.52;
  const labelY = aboveY < fontSize ? snake.head.y * cellHeight + cellHeight + fontSize * 0.15 : aboveY;

  context.save();
  context.font = `700 ${fontSize}px "Segoe UI", "Inter", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const labelWidth = context.measureText(label).width;
  const clampedX = Math.max(labelWidth / 2 + 4, Math.min(boardWidth - labelWidth / 2 - 4, rawX));
  const clampedY = Math.max(fontSize / 2 + 4, Math.min(boardHeight - fontSize / 2 - 4, labelY));

  context.strokeStyle = "rgba(9, 19, 27, 0.96)";
  context.lineWidth = Math.max(2, Math.min(8, fontSize * 0.33));
  context.strokeText(label, clampedX, clampedY);
  context.fillStyle = "rgba(255, 255, 255, 0.98)";
  context.fillText(label, clampedX, clampedY);
  context.restore();
}

function resolveItemSpriteUrl(type: SnakeItem["type"]): string {
  return SNAKE_ITEM_SPRITE_URLS[type];
}

function resolveCoinSpriteUrl(type: SnakeCoin["type"]): string {
  return SNAKE_COIN_SPRITE_URLS[type];
}

function drawSpriteInsideTile(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  left: number,
  top: number,
  width: number,
  height: number,
  padding = 0,
): void {
  const paddedLeft = left + padding;
  const paddedTop = top + padding;
  const paddedWidth = Math.max(1, width - padding * 2);
  const paddedHeight = Math.max(1, height - padding * 2);

  context.drawImage(image, paddedLeft, paddedTop, paddedWidth, paddedHeight);
}

function preloadSnakeSprites(): void {
  for (const url of Object.values(SNAKE_ITEM_SPRITE_URLS)) {
    void getSnakeSprite(url);
  }
  for (const url of Object.values(SNAKE_COIN_SPRITE_URLS)) {
    void getSnakeSprite(url);
  }
}

function subscribeSnakeSpriteLoads(listener: SnakeSpriteLoadListener): () => void {
  snakeSpriteLoadListeners.add(listener);
  return () => {
    snakeSpriteLoadListeners.delete(listener);
  };
}

function notifySnakeSpriteLoads(): void {
  for (const listener of snakeSpriteLoadListeners) {
    listener();
  }
}

function getSnakeSprite(url: string): HTMLImageElement | null {
  if (typeof Image === "undefined") {
    return null;
  }

  const cached = snakeSpriteCache.get(url);
  if (cached !== undefined) {
    return cached.status === "ready" ? cached.image : null;
  }

  const image = new Image();
  const entry: SnakeSpriteCacheEntry = {
    image,
    status: "loading",
  };
  snakeSpriteCache.set(url, entry);

  image.onload = () => {
    const current = snakeSpriteCache.get(url);
    if (current === undefined) {
      return;
    }
    current.status = "ready";
    notifySnakeSpriteLoads();
  };
  image.onerror = () => {
    const current = snakeSpriteCache.get(url);
    if (current === undefined) {
      return;
    }
    current.status = "error";
    notifySnakeSpriteLoads();
  };
  image.src = url;

  return null;
}

function resolveSnakeMobileQuestMessage(
  state: SnakeState | null,
  playerId: string | null,
  quest: SnakeSecretQuestLiveEntry | null,
): string {
  if (state === null) {
    return "Quest status unavailable.";
  }

  if (!state.secretQuestSettings.enabled) {
    return "Secret quests are off.";
  }

  if (state.stage === "lobby" || state.stage === "countdown") {
    return "Secret quests enabled. Your quest appears at round start.";
  }

  if (state.stage !== "running") {
    return "Quest results are shown after the round.";
  }

  if (playerId === null) {
    return "Join as a player to receive a secret quest.";
  }

  if (quest === null) {
    return "No quest assigned for this player this round.";
  }

  return resolveSnakeSecretQuestLabel(quest.questType);
}

function formatSnakeSecretQuestProgress(entry: SnakeSecretQuestLiveEntry, tickHz: number): string {
  if (entry.questType === "survive_30s_no_item") {
    const divisor = Math.max(1, tickHz);
    const currentSeconds = (entry.progressCurrent / divisor).toFixed(1);
    const targetSeconds = (entry.progressTarget / divisor).toFixed(1);
    return `${currentSeconds}s / ${targetSeconds}s`;
  }

  return `${entry.progressCurrent}/${entry.progressTarget}`;
}

function resolveSnakeSecretQuestLabel(type: SnakeSecretQuestLiveEntry["questType"]): string {
  switch (type) {
    case "deaths_max_5_round":
      return "Die at most 5 times this round.";
    case "food_streak_6_no_death":
      return "Eat 6 food in a row without dying.";
    case "kills_6":
      return "Score 6 kills.";
    case "drop_food_6":
      return "Collect 6 drop-food.";
    case "wrap_8":
      return "Wrap across the border 8 times.";
    case "survive_30s_no_item":
      return "Survive 30s without item pickups.";
    default:
      return "Complete your secret quest.";
  }
}

function resolveSnakeCentralSecretQuestHint(state: SnakeState | null): string {
  if (state === null || !state.secretQuestSettings.enabled) {
    return "Secret quests off.";
  }

  if (state.stage === "lobby" || state.stage === "countdown") {
    return "Secret quests enabled. Assignment happens at round start.";
  }

  if (state.stage === "running") {
    const live = state.secretQuestLive ?? [];
    if (live.length === 0) {
      return "Secret quests active: no assignments.";
    }
    const completed = live.filter((entry) => entry.status === "completed").length;
    const failed = live.filter((entry) => entry.status === "failed").length;
    return `Secret quests active: ${completed}/${live.length} completed, ${failed} failed.`;
  }

  const summary = state.secretQuestRoundSummary ?? [];
  if (summary.length === 0) {
    return "Secret quests active this round.";
  }

  const completed = summary.filter((entry) => entry.completed).length;
  const failed = summary.filter((entry) => entry.failed).length;
  return `Secret quest summary: ${completed}/${summary.length} completed, ${failed} failed.`;
}
function resolveSnakeCountdownOverlayText(state: SnakeState | null): string | null {
  if (state === null) {
    return null;
  }

  if (state.stage === "countdown") {
    return state.countdownRemaining === null ? "3" : String(Math.max(1, state.countdownRemaining));
  }

  if (state.stage === "running" && state.tick <= Math.max(1, Math.floor(state.tickHz * 0.75))) {
    return "GO!";
  }

  return null;
}

function resolveSnakeCentralMessage(state: SnakeState | null): string {
  if (state === null) {
    return "Snake state pending.";
  }

  if (state.stage === "game_over") {
    return state.latestMessage;
  }

  return state.latestMessage;
}

function resolveSnakeMobileMessage(state: SnakeState | null): string {
  if (state === null) {
    return "Snake is loading.";
  }

  if (state.stage === "lobby") {
    return "Waiting for the host to start Snake.";
  }

  if (state.stage === "countdown") {
    return state.countdownRemaining === null
      ? "Round starts..."
      : `Round starts in ${state.countdownRemaining}`;
  }

  if (state.stage === "game_over") {
    return state.latestMessage;
  }

  return state.latestMessage;
}

function resolveSnakeOverlayMeta(state: SnakeState): string {
  const base = `${state.stage} / ${state.tickHz} Hz / ${state.aliveCount} alive / items ${state.items.length} / quests ${state.secretQuestSettings.enabled ? "on" : "off"}`;
  if (state.roundMode !== "coinrush") {
    return `${base} / mode ${formatRoundModeLabel(state.roundMode)}`;
  }

  const wave = state.coinrush === null
    ? "coinrush idle"
    : resolveCoinrushWaveLabel(state.coinrush, state.tickHz);
  return `${base} / coins ${state.coins.length} / ${wave}`;
}

function resolveCoinrushWaveLabel(coinrush: SnakeCoinrushState | null, tickHz: number): string {
  if (coinrush === null || coinrush.phase === null) {
    return "coinrush idle";
  }

  const seconds = Math.max(0, coinrush.phaseTicksRemaining / Math.max(1, tickHz));
  return `wave ${coinrush.wave} ${coinrush.phase} ${seconds.toFixed(1)}s`;
}

function resolveItemColor(type: SnakeItem["type"]): string {
  switch (type) {
    case "boost":
      return "#44d2d6";
    case "magnet":
      return "#ffd166";
    case "shield":
      return "#7cb4ff";
    default:
      return "#d9dee7";
  }
}

function formatEffectTicks(ticks: number, tickHz: number): string {
  const seconds = Math.max(0, ticks / Math.max(1, tickHz));
  return `${seconds.toFixed(1)}s`;
}

function formatEnabledItemTypes(settings: SnakeItemSettings): string {
  const enabled = [
    settings.boost ? "boost" : null,
    settings.magnet ? "magnet" : null,
    settings.shield ? "shield" : null,
  ].filter((value): value is string => value !== null);

  return enabled.length === 0 ? "off" : enabled.join(", ");
}

function formatRoundModeLabel(mode: SnakeRoundMode): string {
  return mode === "coinrush" ? "Coinrush" : "Standard";
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

function applyState(api: GameHostApi<SnakeState>, nextState: SnakeEngineState): void {
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

  if (message.action === SNAKE_ITEMS_CONFIG_ACTION && isSnakeItemsConfigValue(message.value)) {
    return message.value;
  }

  if (message.action === SNAKE_MODE_CONFIG_ACTION && isSnakeModeConfigValue(message.value)) {
    return message.value;
  }

  if (
    message.action === SNAKE_SECRET_QUESTS_CONFIG_ACTION &&
    isSnakeSecretQuestsConfigValue(message.value)
  ) {
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

function isSnakeItemsConfigValue(value: unknown): value is SnakeItemsConfigPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const keys = ["boost", "magnet", "shield"];
  return keys.some((key) => key in candidate && typeof candidate[key] === "boolean");
}

function normalizeSnakeItemsConfigPayload(
  value: SnakeInputPayload,
): SnakeItemsConfigPayload | null {
  if (!isSnakeItemsConfigValue(value)) {
    return null;
  }

  const payload: SnakeItemsConfigPayload = {};
  if (typeof value.boost === "boolean") {
    payload.boost = value.boost;
  }
  if (typeof value.magnet === "boolean") {
    payload.magnet = value.magnet;
  }
  if (typeof value.shield === "boolean") {
    payload.shield = value.shield;
  }

  if (Object.keys(payload).length === 0) {
    return null;
  }

  return payload;
}

function isSnakeModeConfigValue(value: unknown): value is SnakeModeConfigPayload {
  if (!isRecord(value)) {
    return false;
  }

  return value.mode === "standard" || value.mode === "coinrush";
}

function normalizeSnakeModeConfigPayload(value: SnakeInputPayload): SnakeRoundMode | null {
  if (!isSnakeModeConfigValue(value)) {
    return null;
  }

  return value.mode;
}
function isSnakeSecretQuestsConfigValue(value: unknown): value is SnakeSecretQuestsConfigPayload {
  return isRecord(value) && typeof value.enabled === "boolean";
}

function normalizeSnakeSecretQuestsConfigPayload(value: SnakeInputPayload): boolean | null {
  if (!isSnakeSecretQuestsConfigValue(value)) {
    return null;
  }

  return value.enabled;
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
    description: "Timed Snake with dynamic maps, host-controlled items, and optional Coinrush mode.",
    displayName: "Snake",
    id: "snake",
    maxPlayers: 12,
    minPlayers: 2,
    supportsTeams: false,
    tickHz: snakeContext.tickHz,
    version: "0.5.0",
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
        gridHeight: runtimeState.publicState.grid.height,
        gridWidth: runtimeState.publicState.grid.width,
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
      if (
        input.action === SNAKE_DIRECTION_ACTION &&
        input.payload !== undefined &&
        "dir" in input.payload &&
        isSnakeDirection(input.payload.dir)
      ) {
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

      if (input.action === SNAKE_ITEMS_CONFIG_ACTION) {
        const players = api.getPlayers();
        const canConfigure = canConfigureSnakeItems(input.playerId, players);
        if (!canConfigure) {
          api.log("warn", "snake_items_config_denied", "Snake item config denied.", {
            playerId: input.playerId,
          });
          return;
        }

        const settings = normalizeSnakeItemsConfigPayload(input.payload);
        if (settings === null) {
          return;
        }

        applyState(
          api,
          reduceSnakeEngineState(
            runtimeState,
            {
              playerId: input.playerId,
              players,
              settings,
              type: "items_config_received",
            },
            snakeContext,
          ),
        );
        publishSnakeHubState(api);
        api.log("info", "snake_items_config_updated", "Snake item config updated.", {
          ...settings,
          playerId: input.playerId,
          stage: runtimeState.publicState.stage,
        });
        return;
      }

      if (input.action === SNAKE_MODE_CONFIG_ACTION) {
        const players = api.getPlayers();
        const canConfigure = canConfigureSnakeItems(input.playerId, players);
        if (!canConfigure) {
          api.log("warn", "snake_mode_config_denied", "Snake mode config denied.", {
            playerId: input.playerId,
          });
          return;
        }

        const mode = normalizeSnakeModeConfigPayload(input.payload);
        if (mode === null) {
          return;
        }

        applyState(
          api,
          reduceSnakeEngineState(
            runtimeState,
            {
              mode,
              playerId: input.playerId,
              players,
              type: "mode_config_received",
            },
            snakeContext,
          ),
        );
        publishSnakeHubState(api);
        api.log("info", "snake_mode_config_updated", "Snake mode config updated.", {
          mode,
          playerId: input.playerId,
          stage: runtimeState.publicState.stage,
        });
        return;
      }
      if (input.action === SNAKE_SECRET_QUESTS_CONFIG_ACTION) {
        const players = api.getPlayers();
        const canConfigure = canConfigureSnakeItems(input.playerId, players);
        if (!canConfigure) {
          api.log("warn", "snake_secret_quests_config_denied", "Snake secret quest config denied.", {
            playerId: input.playerId,
          });
          return;
        }

        const enabled = normalizeSnakeSecretQuestsConfigPayload(input.payload);
        if (enabled === null) {
          return;
        }

        applyState(
          api,
          reduceSnakeEngineState(
            runtimeState,
            {
              enabled,
              playerId: input.playerId,
              players,
              type: "secret_quests_config_received",
            },
            snakeContext,
          ),
        );
        publishSnakeHubState(api);
        api.log("info", "snake_secret_quests_config_updated", "Snake secret quest config updated.", {
          enabled,
          playerId: input.playerId,
          stage: runtimeState.publicState.stage,
        });
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
      const previousMode = runtimeState.publicState.roundMode;
      const previousCoinrushPhase = runtimeState.publicState.coinrush?.phase ?? null;
      const previousCoinrushWave = runtimeState.publicState.coinrush?.wave ?? null;

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
        runtimeState.publicState.stage === "game_over"
      ) {
        if (runtimeState.publicState.winnerPlayerId !== null) {
          api.results.recordPlayerWin(runtimeState.publicState.winnerPlayerId);
        }
        api.results.endRound({
          message: runtimeState.publicState.latestMessage,
          title: "Snake round finished",
        });
        api.log("info", "snake_round_finished", "Snake round finished.", {
          draw: runtimeState.publicState.winnerPlayerId === null,
          previousWinnerPlayerId,
          winnerPlayerId: runtimeState.publicState.winnerPlayerId,
        });
      }

      if (
        previousMode === "coinrush" &&
        previousCoinrushPhase === "active" &&
        runtimeState.publicState.coinrush?.phase === "announce"
      ) {
        api.log("info", "snake_coinrush_wave_reset", "Coinrush wave transitioned to announce and reset coins.", {
          previousWave: previousCoinrushWave,
          wave: runtimeState.publicState.coinrush?.wave ?? null,
        });
      }

      if (previousStage !== "running" && runtimeState.publicState.stage === "running") {
        api.log("info", "snake_running_config_frozen", "Snake running config frozen for this round.", {
          itemSettings: runtimeState.roundItemSettings,
          mode: runtimeState.roundModeFrozen,
          secretQuestAssignments: Object.keys(runtimeState.roundQuestAssignments).length,
          secretQuestsEnabled: runtimeState.roundSecretQuestEnabled,
        });
      }

      publishSnakeHubState(api);
    },
  },
});

function canConfigureSnakeItems(playerId: string, players: GamePlayerSnapshot[]): boolean {
  if (playerId === "host_local") {
    return true;
  }

  const actor = players.find((player) => player.playerId === playerId);
  return actor?.role === "moderator";
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

function asSnakeState(value: unknown): SnakeState | null {
  if (!isRecord(value) || !isSnakeGrid(value.grid) || !Array.isArray(value.snakes)) {
    return null;
  }

  const stage = readStage(value.stage);
  if (stage === null) {
    return null;
  }

  const roundMode = readRoundMode(value.roundMode) ?? "standard";
  const snakes: SnakePlayerState[] = [];
  for (const rawSnake of value.snakes) {
    const parsed = parseSnakePlayerState(rawSnake);
    if (parsed === null) {
      return null;
    }
    snakes.push(parsed);
  }

  const foods = Array.isArray(value.foods)
    ? value.foods.filter((food): food is SnakeFood => isSnakeFood(food))
    : [];
  const items = Array.isArray(value.items)
    ? value.items.filter((item): item is SnakeItem => isSnakeItem(item))
    : [];
  const coins = Array.isArray(value.coins)
    ? value.coins.filter((coin): coin is SnakeCoin => isSnakeCoin(coin))
    : [];
  const itemSettings = isSnakeItemSettings(value.itemSettings)
    ? value.itemSettings
    : DEFAULT_ITEM_SETTINGS;
  const secretQuestSettings = isSnakeSecretQuestSettings(value.secretQuestSettings)
    ? value.secretQuestSettings
    : DEFAULT_SECRET_QUEST_SETTINGS;
  const secretQuestRoundSummary = Array.isArray(value.secretQuestRoundSummary)
    ? value.secretQuestRoundSummary
        .map((entry) => parseSnakeSecretQuestRoundSummaryEntry(entry))
        .filter((entry): entry is SnakeSecretQuestRoundSummaryEntry => entry !== null)
    : null;
  const secretQuestLive = Array.isArray(value.secretQuestLive)
    ? value.secretQuestLive
        .map((entry) => parseSnakeSecretQuestLiveEntry(entry))
        .filter((entry): entry is SnakeSecretQuestLiveEntry => entry !== null)
    : null;
  const coinrush = isSnakeCoinrushState(value.coinrush) ? value.coinrush : null;

  return {
    aliveCount:
      typeof value.aliveCount === "number"
        ? value.aliveCount
        : snakes.filter((snake) => snake.alive).length,
    coinrush,
    coins,
    countdownRemaining: typeof value.countdownRemaining === "number" ? value.countdownRemaining : null,
    foods,
    grid: value.grid,
    itemSettings,
    items,
    latestMessage: typeof value.latestMessage === "string" ? value.latestMessage : "",
    secretQuestLive,
    secretQuestRoundSummary,
    secretQuestSettings,
    roundMode,
    roundSecondsRemaining:
      typeof value.roundSecondsRemaining === "number" ? value.roundSecondsRemaining : null,
    showIdentityLabels:
      typeof value.showIdentityLabels === "boolean"
        ? value.showIdentityLabels
        : stage !== "running",
    snakes,
    stage,
    tick: typeof value.tick === "number" ? value.tick : 0,
    tickHz: typeof value.tickHz === "number" ? value.tickHz : snakeContext.tickHz,
    winnerPlayerId: typeof value.winnerPlayerId === "string" ? value.winnerPlayerId : null,
    winnerTeam: value.winnerTeam === "A" || value.winnerTeam === "B" ? value.winnerTeam : null,
  };
}

function parseSnakePlayerState(value: unknown): SnakePlayerState | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.playerId !== "string" ||
    typeof value.name !== "string" ||
    (value.team !== "A" && value.team !== "B") ||
    typeof value.connected !== "boolean" ||
    typeof value.alive !== "boolean" ||
    typeof value.color !== "string" ||
    typeof value.wins !== "number" ||
    !Array.isArray(value.segments)
  ) {
    return null;
  }

  if (!value.segments.every((segment) => isSnakePoint(segment))) {
    return null;
  }

  const direction = isSnakeDirection(value.direction) ? value.direction : "right";
  const activeEffects = Array.isArray(value.activeEffects)
    ? value.activeEffects.filter((effect): effect is SnakePlayerState["activeEffects"][number] =>
        isSnakeEffect(effect),
      )
    : [];

  return {
    activeEffects,
    alive: value.alive,
    coinCount: typeof value.coinCount === "number" ? value.coinCount : 0,
    color: value.color,
    connected: value.connected,
    direction,
    head: isSnakePoint(value.head) ? value.head : null,
    length: typeof value.length === "number" ? value.length : value.segments.length,
    name: value.name,
    playerId: value.playerId,
    respawnTicksRemaining:
      typeof value.respawnTicksRemaining === "number" ? value.respawnTicksRemaining : null,
    score: typeof value.score === "number" ? value.score : 0,
    segments: value.segments,
    spawnProtectionTicksRemaining:
      typeof value.spawnProtectionTicksRemaining === "number"
        ? value.spawnProtectionTicksRemaining
        : 0,
    speedBank: typeof value.speedBank === "number" ? value.speedBank : 0,
    team: value.team,
    wins: value.wins,
  };
}

function isSnakeFood(value: unknown): value is SnakeFood {
  return (
    isRecord(value) &&
    isSnakePoint(value.point) &&
    (value.source === "normal" || value.source === "drop")
  );
}

function isSnakeItem(value: unknown): value is SnakeItem {
  return (
    isRecord(value) &&
    isSnakePoint(value.point) &&
    (value.type === "boost" || value.type === "magnet" || value.type === "shield")
  );
}

function isSnakeCoin(value: unknown): value is SnakeCoin {
  return (
    isRecord(value) &&
    isSnakePoint(value.point) &&
    (value.type === "normal" || value.type === "gold") &&
    typeof value.value === "number"
  );
}

function isSnakeCoinrushState(value: unknown): value is SnakeCoinrushState {
  if (!isRecord(value) || !Array.isArray(value.announcedHotspots) || !Array.isArray(value.activeHotspots)) {
    return false;
  }

  const phaseValid = value.phase === "announce" || value.phase === "active" || value.phase === null;
  return (
    phaseValid &&
    value.announcedHotspots.every((point) => isSnakePoint(point)) &&
    value.activeHotspots.every((point) => isSnakePoint(point)) &&
    typeof value.phaseTicksRemaining === "number" &&
    typeof value.wave === "number"
  );
}
function isSnakeSecretQuestSettings(value: unknown): value is SnakeSecretQuestSettings {
  return isRecord(value) && typeof value.enabled === "boolean";
}

function parseSnakeSecretQuestRoundSummaryEntry(
  value: unknown,
): SnakeSecretQuestRoundSummaryEntry | null {
  if (
    !isRecord(value) ||
    typeof value.playerId !== "string" ||
    typeof value.completed !== "boolean" ||
    typeof value.bonusAwarded !== "boolean" ||
    !isSnakeSecretQuestType(value.questType)
  ) {
    return null;
  }

  return {
    bonusAwarded: value.bonusAwarded,
    completed: value.completed,
    failed: typeof value.failed === "boolean" ? value.failed : false,
    playerId: value.playerId,
    questType: value.questType,
  };
}

function parseSnakeSecretQuestLiveEntry(value: unknown): SnakeSecretQuestLiveEntry | null {
  if (!isRecord(value) || typeof value.playerId !== "string" || !isSnakeSecretQuestType(value.questType)) {
    return null;
  }

  const status = readSnakeSecretQuestLiveStatus(value.status);

  return {
    playerId: value.playerId,
    progressCurrent: typeof value.progressCurrent === "number" ? value.progressCurrent : 0,
    progressTarget: typeof value.progressTarget === "number" ? value.progressTarget : 0,
    questType: value.questType,
    status,
  };
}

function readSnakeSecretQuestLiveStatus(value: unknown): SnakeSecretQuestLiveEntry["status"] {
  if (value === "completed" || value === "failed") {
    return value;
  }
  return "active";
}

function isSnakeSecretQuestType(value: unknown): value is SnakeSecretQuestLiveEntry["questType"] {
  return (
    value === "deaths_max_5_round" ||
    value === "food_streak_6_no_death" ||
    value === "kills_6" ||
    value === "drop_food_6" ||
    value === "wrap_8" ||
    value === "survive_30s_no_item"
  );
}

function isSnakeItemSettings(value: unknown): value is SnakeItemSettings {
  return (
    isRecord(value) &&
    typeof value.boost === "boolean" &&
    typeof value.magnet === "boolean" &&
    typeof value.shield === "boolean"
  );
}

function isSnakeEffect(value: unknown): value is SnakePlayerState["activeEffects"][number] {
  return (
    isRecord(value) &&
    (value.type === "boost" || value.type === "magnet" || value.type === "shield") &&
    typeof value.ticksRemaining === "number" &&
    typeof value.charges === "number"
  );
}

function isSnakeGrid(value: unknown): value is SnakeState["grid"] {
  return (
    isRecord(value) &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

function isSnakePoint(value: unknown): value is SnakePoint {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number";
}

function readStage(value: unknown): SnakeState["stage"] | null {
  if (value === "lobby" || value === "countdown" || value === "running" || value === "game_over") {
    return value;
  }

  return null;
}

function readRoundMode(value: unknown): SnakeRoundMode | null {
  if (value === "standard" || value === "coinrush") {
    return value;
  }

  return null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const manifest = gamePlugin.manifest;
export default gamePlugin;
export type {
  SnakeActionPayload,
  SnakeDirectionPayload,
  SnakeInputPayload,
  SnakeItemsConfigPayload,
  SnakeModeConfigPayload,
  SnakePoint,
  SnakeSecretQuestsConfigPayload,
};

