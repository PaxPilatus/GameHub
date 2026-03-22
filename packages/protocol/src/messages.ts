import { z } from "zod";

export const PROTOCOL_VERSION = 1;

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

export const MessageIdSchema = z.string().min(1);
export const SessionIdSchema = z.string().min(1);
export const TimestampSchema = z.number().int().nonnegative();
export const PlayerIdSchema = z.string().min(1);
export const PlayerTokenSchema = z.string().min(1);
export const PluginIdSchema = z.string().min(1);

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
  playerName: z.string().min(1),
});

export const HostPlayerStateSchema = z.object({
  connected: z.boolean(),
  lastSeen: TimestampSchema,
  name: z.string().min(1),
  playerId: PlayerIdSchema,
  role: PlayerRoleSchema,
  team: PlayerTeamSchema,
});

export const HostStatePayloadSchema = z.object({
  lifecycle: SessionPhaseSchema,
  moderatorId: PlayerIdSchema.nullable(),
  players: z.array(HostPlayerStateSchema),
  pluginState: z.record(z.unknown()).nullable().optional(),
  relayStatus: RelayConnectionStatusSchema,
  selectedGame: PluginIdSchema.nullable(),
  sessionId: SessionIdSchema,
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
  token: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  playerId: PlayerIdSchema.optional(),
  playerName: z.string().min(1).optional(),
  pluginId: PluginIdSchema.optional(),
  protocolVersion: z.literal(PROTOCOL_VERSION).default(PROTOCOL_VERSION),
});

export const HostHelloMessageSchema = HelloMessageSchema.extend({
  clientKind: z.literal("host"),
  token: z.string().min(1),
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
  detail: z.string().min(1).optional(),
});

export const HeartbeatMessageSchema = BaseMessageSchema.extend({
  type: z.literal("heartbeat"),
});

export const PlayerJoinedMessageSchema = BaseMessageSchema.extend({
  type: z.literal("player_joined"),
  playerId: PlayerIdSchema,
  playerName: z.string().min(1),
  playerToken: PlayerTokenSchema.optional(),
  reconnect: z.boolean().optional(),
});

export const PlayerLeftMessageSchema = BaseMessageSchema.extend({
  type: z.literal("player_left"),
  playerId: PlayerIdSchema,
  reason: z.string().min(1).optional(),
});

export const InputMessageSchema = BaseMessageSchema.extend({
  type: z.literal("input"),
  playerId: PlayerIdSchema,
  sequence: z.number().int().nonnegative(),
  action: z.string().min(1),
  value: InputValueSchema.optional(),
});

export const StartGameMessageSchema = BaseMessageSchema.extend({
  type: z.literal("start_game"),
  pluginId: PluginIdSchema,
  seed: z.number().int().nonnegative(),
});

export const StopGameMessageSchema = BaseMessageSchema.extend({
  type: z.literal("stop_game"),
  reason: z.string().min(1).optional(),
});

export const PluginLoadedMessageSchema = BaseMessageSchema.extend({
  type: z.literal("plugin_loaded"),
  pluginId: PluginIdSchema,
  version: z.string().min(1),
});

export const SessionTerminatedMessageSchema = BaseMessageSchema.extend({
  type: z.literal("session_terminated"),
  sessionId: SessionIdSchema,
  reason: z.string().min(1),
});

export const GameStateMessageSchema = BaseMessageSchema.extend({
  type: z.literal("game_state"),
  pluginId: PluginIdSchema,
  tick: z.number().int().nonnegative(),
  players: z.array(PlayerSchema),
  state: z.record(z.unknown()),
});

export const ErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal("error"),
  code: z.string().min(1),
  message: z.string().min(1),
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
export type HostStatePayload = z.infer<typeof HostStatePayloadSchema>;

export function parseHubMessage(input: unknown): HubMessage {
  return HubMessageSchema.parse(input);
}

export function safeParseHubMessage(input: unknown) {
  return HubMessageSchema.safeParse(input);
}

export function isHubMessage(input: unknown): input is HubMessage {
  return safeParseHubMessage(input).success;
}

export function safeParseHostStatePayload(input: unknown) {
  return HostStatePayloadSchema.safeParse(input);
}