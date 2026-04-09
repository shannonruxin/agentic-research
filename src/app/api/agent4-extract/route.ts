import { NextResponse } from "next/server";
import { z } from "zod";
import { Agent4ExtractError, buildExtractBundle } from "@/lib/agents/agent4Extract";

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

const bodySchema = z.object({
  aiAnswer: aiAnswerSchema,
  agent3Plan: agent3PlanSchema,
});

export const maxDuration = 300;

/**
 * POST `{ aiAnswer, agent3Plan }` → **`ExtractBundle`**
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
      { error: "Invalid body: expected { aiAnswer, agent3Plan }", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const bundle = await buildExtractBundle(parsed.data.aiAnswer, parsed.data.agent3Plan);
    return NextResponse.json(bundle);
  } catch (e) {
    if (e instanceof Agent4ExtractError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 4 extract failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
