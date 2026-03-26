import type { NarrationScript } from "@game-hub/ai-gateway";

import { resolveVoiceForSegment } from "./narration-pipeline.js";

export type TtsSegmentAudio = {
  audioUrl: string;
  durationMsApprox: number;
  segmentIndex: 1 | 2 | 3 | 4;
  speaker: "player" | "judge";
  text: string;
  voiceProfileId: string;
};

export type TtsRenderResult = {
  playerId: string;
  roundIndex: number;
  segments: TtsSegmentAudio[];
};

/**
 * MVP: No external TTS provider — returns zero-length placeholders for host-local playback hooks.
 * Later: swap implementation for real synthesis (still host-only, no secrets in renderer).
 */
export async function renderTtsStubForScript(input: {
  narrationScript: NarrationScript;
  playerVoiceProfileId: string;
  roundIndex: number;
}): Promise<TtsRenderResult> {
  const segments: TtsSegmentAudio[] = input.narrationScript.segments.map((seg) => {
    const voice = resolveVoiceForSegment({
      playerVoiceProfileId: input.playerVoiceProfileId,
      segmentSpeaker: seg.speaker,
    });
    return {
      audioUrl: "",
      durationMsApprox: 0,
      segmentIndex: seg.index,
      speaker: seg.speaker,
      text: seg.text,
      voiceProfileId: voice,
    };
  });

  return {
    playerId: input.narrationScript.playerId,
    roundIndex: input.roundIndex,
    segments,
  };
}
