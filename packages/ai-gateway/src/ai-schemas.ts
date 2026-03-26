import { z } from "zod";

export const CharacterSummarySchema = z.object({
  summaryShort: z.string().min(1).max(280),
});

export const NarrationOutputSchema = z.object({
  narrationText: z.string().min(1).max(400),
  audioCueText: z.string().max(120).optional(),
});

const NarrationSegmentSchema = z.object({
  index: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  maxCharsHint: z.number().int().min(60).max(220).optional(),
  speaker: z.enum(["player", "judge"]),
  text: z.string().min(1).max(200),
});

export const NarrationScriptSchema = z
  .object({
    outcome: z.enum([
      "critical_success",
      "success",
      "mixed",
      "fail",
      "critical_fail",
    ]),
    playerId: z.string().min(1).max(96),
    rollSummary: z.string().min(1).max(240),
    roundIndex: z.number().int().min(0).max(9999),
    segments: z.tuple([
      NarrationSegmentSchema,
      NarrationSegmentSchema,
      NarrationSegmentSchema,
      NarrationSegmentSchema,
    ]),
    sessionId: z.string().min(1).max(96),
  })
  .superRefine((val, ctx) => {
    const expectedSpeakers: Array<"player" | "judge"> = [
      "player",
      "judge",
      "player",
      "judge",
    ];
    val.segments.forEach((seg, i) => {
      if (seg.index !== (i + 1) as 1 | 2 | 3 | 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "segment_index_mismatch",
          path: ["segments", i],
        });
      }
      if (seg.speaker !== expectedSpeakers[i]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "segment_speaker_order",
          path: ["segments", i, "speaker"],
        });
      }
    });
  });

export const JudgeOutputSchema = z.object({
  commentsByPlayerId: z.record(
    z.string().min(1).max(64),
    z.string().min(1).max(160),
  ),
  winnerPlayerId: z.string().min(1).max(64),
  scoresByPlayerId: z.record(
    z.string().min(1).max(64),
    z.number().int().min(0).max(100),
  ),
});

export type CharacterSummaryOutput = z.infer<typeof CharacterSummarySchema>;
export type NarrationOutput = z.infer<typeof NarrationOutputSchema>;
export type NarrationScript = z.infer<typeof NarrationScriptSchema>;
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const candidate = fenced?.[1] !== undefined ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = candidate.slice(start, end + 1);
      try {
        return JSON.parse(slice) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}
