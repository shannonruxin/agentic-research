/**
 * Zod schemas for research dimensions and known-gap groups.
 * These are consumed by the orchestrator pipeline (orchestrator.ts, research-chat route,
 * sandbox2-orchestrator route) and validated at API boundaries.
 */
import { z } from "zod";
import { normalizeDimensionId } from "@/lib/dimensionId";

/** One thematic research dimension (e.g. "competitive-dynamics", "market-size"). */
export const researchDimensionSchema = z
  .object({
    /** Stable slug; derived from label when omitted. */
    id: z.string().optional(),
    label: z.string().min(1),
    description: z.string().optional(),
  })
  .transform((d) => ({
    id: d.id?.trim() ? normalizeDimensionId(d.id) : normalizeDimensionId(d.label),
    label: d.label.trim(),
    description: d.description?.trim() || undefined,
  }));

export const knownGapGroupSchema = z.object({
  dimension: z.string().optional(),
  gaps: z.array(z.string().min(1)).min(1),
});
