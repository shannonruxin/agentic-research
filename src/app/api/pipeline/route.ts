import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAIAnswer, AIAnswerModelError } from "@/lib/agents/aiAnswer";
import { Agent3EvidenceModelError, generateEvidenceSegments } from "@/lib/agents/agent3Segments";
import { Agent6SearchError, generateAgent6Resources } from "@/lib/agents/agent6Search";
import { composeAgent3EvidencePlan } from "@/lib/agents/agent3Evidence";
import { buildExtractBundle, Agent4ExtractError } from "@/lib/agents/agent4Extract";
import { generateCroppedEvidenceItems, Agent5CropModelError } from "@/lib/agents/agent5Crop";
import {
  PARALLEL_SOURCE_POLICY_MAX_DOMAINS,
  mergeParallelSourcePolicy,
  parallelSourcePolicyFromEnv,
} from "@/lib/parallelSourcePolicy";
import type { CroppedEvidenceItem, PipelineDualColumnResponse } from "@/lib/types";

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
  query: z.string().min(1),
  decomposition: decompositionSchema.optional(),
  searchQueries: searchQueriesSchema.optional(),
  sourcePolicy: sourcePolicyBodySchema,
  pipeline_run_id: z.string().optional(),
});

export const maxDuration = 300;

function sortCroppedByFlow(items: CroppedEvidenceItem[]): CroppedEvidenceItem[] {
  return [...items].sort((a, b) => {
    if (a.flow_index !== b.flow_index) return a.flow_index - b.flow_index;
    return a.url.localeCompare(b.url);
  });
}

/**
 * POST **`{ query, decomposition?, searchQueries?, sourcePolicy?, pipeline_run_id? }`**
 * → **`PipelineDualColumnResponse`** (no Agent 7 until task 13).
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
          "Invalid body: expected { query, decomposition?, searchQueries?, sourcePolicy?, pipeline_run_id? }",
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

  const runId = parsed.data.pipeline_run_id;

  let ai;
  try {
    ai = await generateAIAnswer(parsed.data.query, dec);
  } catch (e) {
    if (e instanceof AIAnswerModelError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "AIAnswer failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let evidence_segments;
  try {
    evidence_segments = await generateEvidenceSegments(ai.answer_text, dec);
  } catch (e) {
    if (e instanceof Agent3EvidenceModelError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 3 segmentation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let resources;
  try {
    resources = await generateAgent6Resources(ai, evidence_segments, dec, sq, { sourcePolicy });
  } catch (e) {
    if (e instanceof Agent3EvidenceModelError || e instanceof Agent6SearchError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 6 search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const agent3_plan = composeAgent3EvidencePlan(evidence_segments, resources);

  let bundle;
  try {
    bundle = await buildExtractBundle(ai, agent3_plan);
  } catch (e) {
    if (e instanceof Agent4ExtractError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 4 extract failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let evidence_items: CroppedEvidenceItem[];
  if (Object.keys(bundle).length === 0) {
    evidence_items = [];
  } else {
    try {
      const items = await generateCroppedEvidenceItems(ai, agent3_plan, bundle);
      evidence_items = sortCroppedByFlow(items);
    } catch (e) {
      if (e instanceof Agent5CropModelError) {
        return NextResponse.json({ error: e.message }, { status: 502 });
      }
      const message = e instanceof Error ? e.message : "Agent 5 crop failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const core_query = dec?.core_query ?? parsed.data.query.trim();
  const body: PipelineDualColumnResponse = {
    core_query,
    ...(dec ? { decomposition: dec } : {}),
    ai_answer: ai,
    agent3_plan,
    evidence_items,
    ...(runId ? { pipeline_run_id: runId } : {}),
  };

  return NextResponse.json(body);
}
