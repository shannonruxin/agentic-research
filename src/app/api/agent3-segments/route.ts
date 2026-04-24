import { NextResponse } from "next/server";
import { z } from "zod";
import { Agent3EvidenceModelError, generateEvidenceSegments } from "@/lib/agents/agent3Segments";

const supportAngleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

const decompositionSchema = z.object({
  core_query: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  support_angles: z.array(supportAngleSchema).min(2).max(6),
});

const aiAnswerSchema = z.object({
  answer_text: z.string().min(1),
  declared_sources: z.array(
    z.object({
      url: z.string().min(1),
      title: z.string().nullable().optional(),
    }),
  ),
});

const bodySchema = z.object({
  aiAnswer: aiAnswerSchema,
  decomposition: decompositionSchema.optional(),
  /** Optional client correlation id (echoed in response when set). */
  pipeline_run_id: z.string().optional(),
});

export const maxDuration = 300;

/**
 * POST `{ aiAnswer, decomposition?, pipeline_run_id? }` → `{ evidence_segments }`
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
      {
        error: "Invalid body: expected { aiAnswer, decomposition?, pipeline_run_id? }",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const dec = parsed.data.decomposition;
  if (dec) {
    const ids = dec.support_angles.map((a) => a.id);
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json(
        { error: "decomposition.support_angles must have unique id values" },
        { status: 400 },
      );
    }
  }

  try {
    const evidence_segments = await generateEvidenceSegments(parsed.data.aiAnswer.answer_text, dec);
    return NextResponse.json({ evidence_segments });
  } catch (e) {
    if (e instanceof Agent3EvidenceModelError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 3 segmentation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
