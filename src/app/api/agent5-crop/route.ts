import { NextResponse } from "next/server";
import { z } from "zod";
import { Agent5CropModelError, generateCroppedEvidenceItems } from "@/lib/agents/agent5Crop";

const aiAnswerSchema = z.object({
  answer_text: z.string().min(1),
  declared_sources: z.array(
    z.object({
      url: z.string().min(1),
      title: z.string().nullable().optional(),
    }),
  ),
});

const evidenceSegmentSchema = z.object({
  segment_id: z.string().min(1),
  quote_from_ai_answer: z.string().min(1),
  intent: z.string().optional(),
  verification_challenge: z.string().min(1),
});

const agent3ResourceSchema = z.object({
  url: z.string().min(1),
  segment_ids: z.array(z.string()),
  angle_id: z.string().optional(),
  title: z.string().nullable().optional(),
  status: z.enum(["ok", "fetch_failed", "not_credible", "pending"]),
  notes: z.string().optional(),
});

const agent3PlanSchema = z.object({
  evidence_segments: z.array(evidenceSegmentSchema),
  resources: z.array(agent3ResourceSchema),
});

const retrievedPageSchema = z.object({
  url: z.string(),
  author: z.union([z.string(), z.null()]).optional(),
  publication: z.union([z.string(), z.null()]).optional(),
  year: z.union([z.number(), z.null()]).optional(),
  cleanText: z.string(),
  httpStatus: z.number(),
  extract_error: z.string().optional(),
});

const bodySchema = z.object({
  aiAnswer: aiAnswerSchema,
  agent3Plan: agent3PlanSchema,
  extractBundle: z.record(z.string(), retrievedPageSchema),
});

export const maxDuration = 300;

/**
 * POST `{ aiAnswer, agent3Plan, extractBundle }` → **`CroppedEvidenceItem[]`**
 */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const items = await generateCroppedEvidenceItems(
      parsed.data.aiAnswer,
      parsed.data.agent3Plan,
      parsed.data.extractBundle,
    );
    return NextResponse.json(items);
  } catch (e) {
    if (e instanceof Agent5CropModelError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 5 crop failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
