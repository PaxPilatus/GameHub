import {
  InputValueSchema,
  type InputValue,
} from "@game-hub/protocol";

const MAX_ID_LENGTH = 64;

export type HostWindowKind = "admin" | "central";

export function assertWindowAccess(
  command: string,
  windowKind: HostWindowKind,
  allowedWindowKinds: readonly HostWindowKind[],
): void {
  if (!allowedWindowKinds.includes(windowKind)) {
    throw new Error(`${command} is not available from the ${windowKind} window.`);
  }
}

export function parseGameId(value: unknown): string {
  return parseBoundedString(value, "gameId");
}

export function parsePlayerId(value: unknown): string {
  return parseBoundedString(value, "playerId");
}

export function parsePluginAction(
  action: unknown,
  payload: unknown,
): { action: string; payload?: InputValue } {
  const parsedAction = parseBoundedString(action, "action");
  const parsedPayload = payload === undefined ? undefined : InputValueSchema.parse(payload);

  return parsedPayload === undefined
    ? { action: parsedAction }
    : { action: parsedAction, payload: parsedPayload };
}

function parseBoundedString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const normalized = value.trim();

  if (normalized === "") {
    throw new Error(`${label} must not be empty.`);
  }

  if (normalized.length > MAX_ID_LENGTH) {
    throw new Error(`${label} exceeds the maximum length of ${MAX_ID_LENGTH}.`);
  }

  return normalized;
}
