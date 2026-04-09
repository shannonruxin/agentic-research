import { NextResponse } from "next/server";
import { z } from "zod";
import { AIAnswerModelError, generateAIAnswer } from "@/lib/agents/aiAnswer";

const supportAngleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

const decompositionSchema = z
  .object({
    core_query: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1),
    support_angles: z.array(supportAngleSchema).min(2).max(6),
  })
  .optional();

const bodySchema = z.object({
  query: z.string().min(1),
  decomposition: decompositionSchema,
});

export const maxDuration = 120;

/**
 * POST `{ query: string, decomposition?: QueryDecomposition }` → `AIAnswerOutput`
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
      { error: "Invalid body: expected { query: string, decomposition?: QueryDecomposition }" },
      { status: 400 },
    );
  }

  if (parsed.data.decomposition) {
    const ids = parsed.data.decomposition.support_angles.map((a) => a.id);
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json(
        { error: "decomposition.support_angles must have unique id values" },
        { status: 400 },
      );
    }
  }

  try {
    const result = await generateAIAnswer(parsed.data.query, parsed.data.decomposition);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AIAnswerModelError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "AIAnswer failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
