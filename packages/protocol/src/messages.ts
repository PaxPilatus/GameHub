import { z } from "zod";

export const PROTOCOL_VERSION = 1;

const MAX_MESSAGE_ID_LENGTH = 64;
const MAX_SESSION_ID_LENGTH = 64;
const MAX_PLAYER_ID_LENGTH = 64;
const MAX_PLAYER_TOKEN_LENGTH = 128;
const MAX_PLUGIN_ID_LENGTH = 64;
const MAX_PLAYER_NAME_LENGTH = 48;
const MAX_ACTION_LENGTH = 64;
const MAX_REASON_LENGTH = 160;
const MAX_ERROR_CODE_LENGTH = 64;
const MAX_ERROR_MESSAGE_LENGTH = 240;
const MAX_URL_LENGTH = 2048;
const MAX_STATUS_LENGTH = 64;

function normalizeHumanReadableString(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function createNormalizedStringSchema(maxLength: number) {
  return z
    .string()
    .transform((value) => normalizeHumanReadableString(value))
    .pipe(z.string().min(1).max(maxLength));
}

function createBoundedStringSchema(maxLength: number) {
  return z.string().min(1).max(maxLength);
}

export const PeerRoleSchema = z.enum(["host", "client", "relay"]);
export const ClientKindSchema = z.enum(["host", "mobile"]);
export const SessionPhaseSchema = z.enum([
  "idle",
  "lobby",
  "game_running",
  "game_finished",
  "closing",
  "terminated",
]);
export const RelayConnectionStatusSchema = z.enum([
  "disconnected",
  "creating_session",
  "connecting",
  "connected",
  "error",
]);
export const PlayerRoleSchema = z.enum(["player", "moderator"]);
export const PlayerTeamSchema = z.enum(["A", "B"]);
export const GameMatchStatusStateSchema = z.enum([
  "idle",
  "countdown",
  "running",
  "paused",
  "round_finished",
  "match_finished",
]);
export const GameUiBadgeToneSchema = z.enum(["info", "neutral", "success", "warn"]);
export const GameUiOverlayToneSchema = z.enum(["error", "info", "success", "warn"]);

export const MessageIdSchema = createBoundedStringSchema(MAX_MESSAGE_ID_LENGTH);
export const SessionIdSchema = createBoundedStringSchema(MAX_SESSION_ID_LENGTH);
export const TimestampSchema = z.number().int().nonnegative();
export const PlayerIdSchema = createBoundedStringSchema(MAX_PLAYER_ID_LENGTH);
export const PlayerTokenSchema = createBoundedStringSchema(MAX_PLAYER_TOKEN_LENGTH);
export const PluginIdSchema = createBoundedStringSchema(MAX_PLUGIN_ID_LENGTH);
export const PlayerDisplayNameSchema = createNormalizedStringSchema(
  MAX_PLAYER_NAME_LENGTH,
);
export const StatusTextSchema = createNormalizedStringSchema(MAX_STATUS_LENGTH);

export type InputValue =
  | string
  | number
  | boolean
  | null
  | InputValue[]
  | { [key: string]: InputValue };

const InputScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const InputValueSchema: z.ZodType<InputValue> = z.lazy(() =>
  z.union([
    InputScalarSchema,
    z.array(InputValueSchema),
    z.record(InputValueSchema),
  ]),
);

export const PlayerSchema = z.object({
  playerId: PlayerIdSchema,
  playerName: PlayerDisplayNameSchema,
});

export const HostPlayerStateSchema = z.object({
  connected: z.boolean(),
  lastSeen: TimestampSchema,
  name: PlayerDisplayNameSchema,
  playerId: PlayerIdSchema,
  role: PlayerRoleSchema,
  team: PlayerTeamSchema,
});

export const SessionLeaderboardEntrySchema = z.object({
  connected: z.boolean(),
  name: PlayerDisplayNameSchema,
  placement: z.number().int().positive().nullable(),
  playerId: PlayerIdSchema,
  role: PlayerRoleSchema,
  score: z.number(),
  status: StatusTextSchema.nullable(),
  team: PlayerTeamSchema,
  teamScore: z.number(),
  wins: z.number().int().nonnegative(),
});

export const GameMatchStatusSchema = z.object({
  message: z.string().min(1).nullable(),
  state: GameMatchStatusStateSchema,
  title: z.string().min(1).nullable(),
});

export const GameUiBadgeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  tone: GameUiBadgeToneSchema.default("neutral"),
  value: z.string().min(1),
});

export const GameUiOverlaySchema = z.object({
  message: z.string().min(1).nullable(),
  title: z.string().min(1),
  tone: GameUiOverlayToneSchema.default("info"),
});

export const HubStatePayloadSchema = z.object({
  joinUrl: createBoundedStringSchema(MAX_URL_LENGTH).nullable(),
  lastRelayMessageAt: TimestampSchema.nullable(),
  leaderboard: z.array(SessionLeaderboardEntrySchema),
  lifecycle: SessionPhaseSchema,
  matchStatus: GameMatchStatusSchema,
  moderatorId: PlayerIdSchema.nullable(),
  overlay: GameUiOverlaySchema.nullable(),
  players: z.array(HostPlayerStateSchema),
  relayStatus: RelayConnectionStatusSchema,
  selectedGame: PluginIdSchema.nullable(),
  sessionId: SessionIdSchema,
  statusBadges: z.array(GameUiBadgeSchema),
  updatedAt: TimestampSchema,
});

export const HostStatePayloadSchema = HubStatePayloadSchema;

export const GameStateEnvelopePayloadSchema = z.object({
  gameState: z.record(z.unknown()).nullable(),
  hubState: HubStatePayloadSchema,
});

const BaseMessageSchema = z.object({
  id: MessageIdSchema,
  sentAt: TimestampSchema,
});

export const HelloMessageSchema = BaseMessageSchema.extend({
  type: z.literal("hello"),
  role: PeerRoleSchema.optional(),
  clientKind: ClientKindSchema.optional(),
  sessionId: SessionIdSchema,
  token: createBoundedStringSchema(MAX_PLAYER_TOKEN_LENGTH).optional(),
  name: PlayerDisplayNameSchema.optional(),
  playerId: PlayerIdSchema.optional(),
  playerName: PlayerDisplayNameSchema.optional(),
  pluginId: PluginIdSchema.optional(),
  protocolVersion: z.literal(PROTOCOL_VERSION).default(PROTOCOL_VERSION),
});

export const HostHelloMessageSchema = HelloMessageSchema.extend({
  clientKind: z.literal("host"),
  token: createBoundedStringSchema(MAX_PLAYER_TOKEN_LENGTH),
});

export const MobileHelloMessageSchema = HelloMessageSchema.extend({
  clientKind: z.literal("mobile"),
  token: PlayerTokenSchema.optional(),
});

export const HelloAckMessageSchema = BaseMessageSchema.extend({
  type: z.literal("hello_ack"),
  sessionId: SessionIdSchema,
  playerId: PlayerIdSchema.optional(),
  playerToken: PlayerTokenSchema.optional(),
  role: PlayerRoleSchema.optional(),
  phase: SessionPhaseSchema.optional(),
  reconnect: z.boolean().default(false),
  heartbeatIntervalMs: z.number().int().positive(),
});

export const AckMessageSchema = BaseMessageSchema.extend({
  type: z.literal("ack"),
  refId: MessageIdSchema,
  accepted: z.boolean(),
  detail: createNormalizedStringSchema(MAX_REASON_LENGTH).optional(),
});

export const HeartbeatMessageSchema = BaseMessageSchema.extend({
  type: z.literal("heartbeat"),
});

export const PlayerJoinedMessageSchema = BaseMessageSchema.extend({
  type: z.literal("player_joined"),
  playerId: PlayerIdSchema,
  playerName: PlayerDisplayNameSchema,
  playerToken: PlayerTokenSchema.optional(),
  reconnect: z.boolean().optional(),
});

export const PlayerLeftMessageSchema = BaseMessageSchema.extend({
  type: z.literal("player_left"),
  playerId: PlayerIdSchema,
  reason: createNormalizedStringSchema(MAX_REASON_LENGTH).optional(),
});

export const InputMessageSchema = BaseMessageSchema.extend({
  type: z.literal("input"),
  playerId: PlayerIdSchema,
  sequence: z.number().int().nonnegative(),
  action: createBoundedStringSchema(MAX_ACTION_LENGTH),
  value: InputValueSchema.optional(),
});

export const StartGameMessageSchema = BaseMessageSchema.extend({
  type: z.literal("start_game"),
  pluginId: PluginIdSchema,
  seed: z.number().int().nonnegative(),
});

export const StopGameMessageSchema = BaseMessageSchema.extend({
  type: z.literal("stop_game"),
  reason: createNormalizedStringSchema(MAX_REASON_LENGTH).optional(),
});

export const PluginLoadedMessageSchema = BaseMessageSchema.extend({
  type: z.literal("plugin_loaded"),
  pluginId: PluginIdSchema,
  version: createBoundedStringSchema(MAX_REASON_LENGTH),
});

export const SessionTerminatedMessageSchema = BaseMessageSchema.extend({
  type: z.literal("session_terminated"),
  sessionId: SessionIdSchema,
  reason: createNormalizedStringSchema(MAX_REASON_LENGTH),
});

export const GameStateMessageSchema = BaseMessageSchema.extend({
  type: z.literal("game_state"),
  pluginId: PluginIdSchema,
  tick: z.number().int().nonnegative(),
  players: z.array(PlayerSchema),
  state: GameStateEnvelopePayloadSchema,
});

export const ErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal("error"),
  code: createBoundedStringSchema(MAX_ERROR_CODE_LENGTH),
  message: createNormalizedStringSchema(MAX_ERROR_MESSAGE_LENGTH),
});

export const messageSchemas = {
  hello: HelloMessageSchema,
  hello_ack: HelloAckMessageSchema,
  ack: AckMessageSchema,
  heartbeat: HeartbeatMessageSchema,
  player_joined: PlayerJoinedMessageSchema,
  player_left: PlayerLeftMessageSchema,
  input: InputMessageSchema,
  start_game: StartGameMessageSchema,
  stop_game: StopGameMessageSchema,
  plugin_loaded: PluginLoadedMessageSchema,
  session_terminated: SessionTerminatedMessageSchema,
  game_state: GameStateMessageSchema,
  error: ErrorMessageSchema,
} as const;

export const HubMessageSchema = z.discriminatedUnion("type", [
  HelloMessageSchema,
  HelloAckMessageSchema,
  AckMessageSchema,
  HeartbeatMessageSchema,
  PlayerJoinedMessageSchema,
  PlayerLeftMessageSchema,
  InputMessageSchema,
  StartGameMessageSchema,
  StopGameMessageSchema,
  PluginLoadedMessageSchema,
  SessionTerminatedMessageSchema,
  GameStateMessageSchema,
  ErrorMessageSchema,
]);

export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type HostHelloMessage = z.infer<typeof HostHelloMessageSchema>;
export type MobileHelloMessage = z.infer<typeof MobileHelloMessageSchema>;
export type HelloAckMessage = z.infer<typeof HelloAckMessageSchema>;
export type AckMessage = z.infer<typeof AckMessageSchema>;
export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>;
export type PlayerJoinedMessage = z.infer<typeof PlayerJoinedMessageSchema>;
export type PlayerLeftMessage = z.infer<typeof PlayerLeftMessageSchema>;
export type InputMessage = z.infer<typeof InputMessageSchema>;
export type StartGameMessage = z.infer<typeof StartGameMessageSchema>;
export type StopGameMessage = z.infer<typeof StopGameMessageSchema>;
export type PluginLoadedMessage = z.infer<typeof PluginLoadedMessageSchema>;
export type SessionTerminatedMessage = z.infer<
  typeof SessionTerminatedMessageSchema
>;
export type GameStateMessage = z.infer<typeof GameStateMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type HubMessage = z.infer<typeof HubMessageSchema>;
export type PeerRole = z.infer<typeof PeerRoleSchema>;
export type ClientKind = z.infer<typeof ClientKindSchema>;
export type SessionPhase = z.infer<typeof SessionPhaseSchema>;
export type RelayConnectionStatus = z.infer<
  typeof RelayConnectionStatusSchema
>;
export type PlayerRole = z.infer<typeof PlayerRoleSchema>;
export type PlayerTeam = z.infer<typeof PlayerTeamSchema>;
export type HostPlayerState = z.infer<typeof HostPlayerStateSchema>;
export type HubStatePayload = z.infer<typeof HubStatePayloadSchema>;
export type HostStatePayload = z.infer<typeof HostStatePayloadSchema>;
export type SessionLeaderboardEntry = z.infer<typeof SessionLeaderboardEntrySchema>;
export type GameMatchStatus = z.infer<typeof GameMatchStatusSchema>;
export type GameUiBadge = z.infer<typeof GameUiBadgeSchema>;
export type GameUiOverlay = z.infer<typeof GameUiOverlaySchema>;
export type GameStateEnvelopePayload = z.infer<typeof GameStateEnvelopePayloadSchema>;

export function parseHubMessage(input: unknown): HubMessage {
  return HubMessageSchema.parse(input);
}

export function safeParseGameStateEnvelope(input: unknown) {
  return GameStateEnvelopePayloadSchema.safeParse(input);
}

export function safeParseHubMessage(input: unknown) {
  return HubMessageSchema.safeParse(input);
}

export function safeParseHubStatePayload(input: unknown) {
  return HubStatePayloadSchema.safeParse(input);
}

export function safeParseHostStatePayload(input: unknown) {
  const envelopeResult = safeParseGameStateEnvelope(input);

  if (envelopeResult.success) {
    return safeParseHubStatePayload(envelopeResult.data.hubState);
  }

  return safeParseHubStatePayload(input);
}

export function isHubMessage(input: unknown): input is HubMessage {
  return safeParseHubMessage(input).success;
}
