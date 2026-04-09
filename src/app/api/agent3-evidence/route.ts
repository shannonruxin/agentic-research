import { NextResponse } from "next/server";
import { z } from "zod";
import {
  Agent3EvidenceModelError,
  generateAgent3EvidencePlan,
} from "@/lib/agents/agent3Evidence";

const supportAngleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

const strategyItemSchema = z.object({
  type: z.string().min(1),
  query: z.string().min(1),
  reasoning: z.string().min(1),
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

const searchQueriesSchema = z.record(z.string(), z.array(strategyItemSchema).min(1));

const bodySchema = z.object({
  aiAnswer: aiAnswerSchema,
  /** Optional: improves segment framing and enables angle-scoped strategy queries. */
  decomposition: decompositionSchema.optional(),
  /** Optional: extra search query strings per angle when decomposition is present; extra queries otherwise. */
  searchQueries: searchQueriesSchema.optional(),
});

export const maxDuration = 300;

/**
 * POST `{ aiAnswer, decomposition?, searchQueries? }` → `Agent3EvidencePlan`
 * Only `aiAnswer` is required.
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
        error: "Invalid body: expected { aiAnswer, decomposition?, searchQueries? }",
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

  const sq = parsed.data.searchQueries;
  if (dec && sq) {
    const ids = new Set(dec.support_angles.map((a) => a.id));
    for (const k of Object.keys(sq)) {
      if (!ids.has(k)) {
        return NextResponse.json(
          { error: `searchQueries has unknown angle key "${k}" (not in support_angles)` },
          { status: 400 },
        );
      }
    }
  }

  try {
    const result = await generateAgent3EvidencePlan(parsed.data.aiAnswer, dec, sq);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Agent3EvidenceModelError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 3 evidence plan failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
