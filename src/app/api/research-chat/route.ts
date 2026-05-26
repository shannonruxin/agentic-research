import { NextResponse } from "next/server";
import { z } from "zod";
import { researchDimensionSchema } from "@/lib/agents/dimensionSchemas";
import { runParallelPipeline } from "@/lib/agents/runParallelPipeline";
import { PARALLEL_SOURCE_POLICY_MAX_DOMAINS } from "@/lib/parallelSourcePolicy";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const knownGapGroupBodySchema = z.object({
  dimension: z.string().optional(),
  gaps: z.array(z.string().min(1)).min(1),
});

const sessionPreferenceSchema = z.object({
  rule: z.string(),
  source: z.string(),
  added: z.string(),
});

const sourcePolicyBodySchema = z
  .object({
    excludeDomains: z.array(z.string().max(256)).max(PARALLEL_SOURCE_POLICY_MAX_DOMAINS).optional(),
    includeDomains: z.array(z.string().max(256)).max(PARALLEL_SOURCE_POLICY_MAX_DOMAINS).optional(),
    afterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    beforeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .optional();

const bodySchema = z.object({
  message: z.string().min(1),
  subject_scope: z.string().max(12_000).optional(),
  research_hygiene: jsonObjectSchema.optional(),
  memory: jsonObjectSchema.optional(),
  known_gaps_seed: z.array(knownGapGroupBodySchema).optional(),
  key_findings: jsonObjectSchema.optional(),
  dimensions: z.array(researchDimensionSchema).min(1).max(16).optional(),
  // Legacy fields — accepted for backward compat but ignored by parallel pipeline
  max_outer_iterations: z.number().int().min(1).max(50).optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  max_iterations_3_6: z.number().int().min(1).max(20).optional(),
  // New fields
  session_preferences: z.array(sessionPreferenceSchema).optional(),
  pipeline_config: z
    .object({
      max_rounds: z.number().int().min(1).max(5).optional(),
      max_workers_concurrent: z.number().int().min(1).max(6).optional(),
      worker_stagger_ms: z.number().int().min(0).max(10000).optional(),
      max_worker_steps: z.number().int().min(1).max(10).optional(),
      max_tasks_per_round: z.number().int().min(1).max(12).optional(),
      orchestrator_temperature: z.number().min(0).max(1).optional(),
      worker_temperature: z.number().min(0).max(1).optional(),
      deliver_max_tokens: z.number().int().min(4000).max(32000).optional(),
    })
    .optional(),
  sourcePolicy: sourcePolicyBodySchema,
});

export const maxDuration = 300;

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
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const b = parsed.data;

  try {
    const result = await runParallelPipeline({
      objective: b.message,
      subject_scope: b.subject_scope,
      research_hygiene: b.research_hygiene,
      memoryJson: b.memory,
      known_gaps_seed: b.known_gaps_seed,
      key_findings: b.key_findings,
      dimensions: b.dimensions,
      session_preferences: b.session_preferences,
      pipeline_config: b.pipeline_config,
      source_policy_request: b.sourcePolicy ?? undefined,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error, steps: result.steps }, { status: 502 });
    }

    return NextResponse.json({
      document_markdown: result.document_markdown,
      stopped: result.stopped,
      key_findings: result.key_findings,
      dimensions: result.dimensions,
      known_gaps: result.known_gaps,
      steps: result.steps,
      chat_memory_path: result.chat_memory_path,
      user_output_path: result.user_output_path,
      preference_notification: result.preference_notification,
      session_preferences: result.session_preferences,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Research chat failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
