import { z } from "zod";

export const CharacterSummarySchema = z.object({
  summaryShort: z.string().min(1).max(280),
});

export const NarrationOutputSchema = z.object({
  narrationText: z.string().min(1).max(400),
  audioCueText: z.string().max(120).optional(),
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
