import { NextResponse } from "next/server";
import { z } from "zod";
import { Agent3EvidenceModelError } from "@/lib/agents/agent3Segments";
import { Agent6SearchError, generateAgent6Resources } from "@/lib/agents/agent6Search";
import {
  PARALLEL_SOURCE_POLICY_MAX_DOMAINS,
  mergeParallelSourcePolicy,
  parallelSourcePolicyFromEnv,
} from "@/lib/parallelSourcePolicy";
import {
  bestEffortLogAgentStage,
  bestEffortPersistAgent3Plan,
} from "@/lib/pipeline/convexPipelineSideEffects";

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

const evidenceSegmentSchema = z.object({
  segment_id: z.string().min(1),
  quote_from_ai_answer: z.string().min(1),
  intent: z.string().optional(),
  verification_challenge: z.string().min(1),
});

const searchQueriesSchema = z.record(z.string(), z.array(strategyItemSchema).min(1));

const sourcePolicyBodySchema = z
  .object({
    excludeDomains: z.array(z.string().max(256)).max(PARALLEL_SOURCE_POLICY_MAX_DOMAINS).optional(),
    includeDomains: z.array(z.string().max(256)).max(PARALLEL_SOURCE_POLICY_MAX_DOMAINS).optional(),
    afterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    beforeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .optional();

const bodySchema = z.object({
  aiAnswer: aiAnswerSchema,
  evidence_segments: z.array(evidenceSegmentSchema).min(1),
  decomposition: decompositionSchema.optional(),
  searchQueries: searchQueriesSchema.optional(),
  sourcePolicy: sourcePolicyBodySchema,
  pipeline_run_id: z.string().optional(),
});

export const maxDuration = 300;

/**
 * POST `{ aiAnswer, evidence_segments, decomposition?, searchQueries?, sourcePolicy?, pipeline_run_id? }`
 * → `{ resources }` (**`Agent3ResourceRow[]`**)
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
        error:
          "Invalid body: expected { aiAnswer, evidence_segments, decomposition?, searchQueries?, sourcePolicy?, pipeline_run_id? }",
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

  const sourcePolicy = mergeParallelSourcePolicy(
    parallelSourcePolicyFromEnv(),
    parsed.data.sourcePolicy ?? undefined,
  );

  try {
    const resources = await generateAgent6Resources(
      parsed.data.aiAnswer,
      parsed.data.evidence_segments,
      dec,
      sq,
      { sourcePolicy },
    );
    const plan = { evidence_segments: parsed.data.evidence_segments, resources };
    void bestEffortPersistAgent3Plan(parsed.data.pipeline_run_id, plan);
    void bestEffortLogAgentStage(parsed.data.pipeline_run_id, "agent6", "ok", {
      input_summary: `segments:${parsed.data.evidence_segments.length}`,
      output_summary: `resources:${resources.length}`,
    });
    return NextResponse.json({ resources });
  } catch (e) {
    void bestEffortLogAgentStage(parsed.data.pipeline_run_id, "agent6", "error", {
      input_summary: "agent6-search",
      error: e instanceof Error ? e.message : String(e),
    });
    if (e instanceof Agent3EvidenceModelError || e instanceof Agent6SearchError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 6 search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
