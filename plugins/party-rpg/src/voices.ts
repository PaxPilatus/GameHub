export const PLAYER_VOICE_A = "player_voice_a";
export const PLAYER_VOICE_B = "player_voice_b";
export const JUDGE_VOICE_DEFAULT = "judge_voice_default";

export type PlayerVoiceProfileId = typeof PLAYER_VOICE_A | typeof PLAYER_VOICE_B;

export function normalizePlayerVoiceProfileId(raw: string | null | undefined): PlayerVoiceProfileId {
  const t = raw?.trim() ?? "";
  if (t === PLAYER_VOICE_B) {
    return PLAYER_VOICE_B;
  }
  return PLAYER_VOICE_A;
}
