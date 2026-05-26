import { NextResponse } from "next/server";
import { z } from "zod";
import { orchestratorPlan, orchestratorReview, orchestratorDeliver } from "@/lib/agents/orchestrator";
import { researchDimensionSchema, knownGapGroupSchema } from "@/lib/agents/dimensionSchemas";
import { loadWorkspaceDomainManualOrDefault } from "@/lib/workspaceNode";
import { readUserPreferences } from "@/lib/preferenceUtils";
import { extractApplicablePreferences } from "@/lib/agents/preferencesAgent";
import { DEFAULT_PIPELINE_CONFIG } from "@/lib/types";
import type { PipelineConfig } from "@/lib/types";

const workerSourceRowSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  relevance: z.string(),
  data_noted: z.string(),
});

const workerOutputSchema = z.object({
  task_id: z.string(),
  dimension: z.string(),
  factor: z.string(),
  summary: z.string(),
  sources: z.array(workerSourceRowSchema),
  extracted_data: z.array(z.record(z.string(), z.unknown())),
  confidence: z.number(),
  gaps_remaining: z.array(z.string()),
  search_queries_used: z.array(z.string()),
  rabbithole_leads: z.array(z.string()).optional(),
});

const orchestratorTaskSchema = z.object({
  task_id: z.string(),
  dimension: z.string(),
  factor: z.string(),
  goal: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  search_guidance: z.array(z.string()),
  variables_to_find: z.array(z.string()).optional(),
  extraction_focus: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]),
  follow_domain_manual: z.boolean().optional(),
});

const planOutputSchema = z.object({
  objective_understanding: z.string(),
  investment_thesis_draft: z.string(),
  dimensions: z.array(researchDimensionSchema),
  known_gaps: z.array(knownGapGroupSchema),
  tasks: z.array(orchestratorTaskSchema),
  execution_strategy: z.enum(["all_parallel", "two_phase"]),
  profile_task_id: z.string().optional(),
  working_notes: z.string(),
});

const coverageSchema = z.object({
  dimension: z.string(),
  score: z.number(),
  reasoning: z.string(),
});

const reviewOutputSchema = z.object({
  working_notes: z.string(),
  key_findings: z.record(z.string(), z.unknown()),
  coverage_assessment: z.array(coverageSchema),
  dimensions: z.array(researchDimensionSchema),
  known_gaps: z.array(knownGapGroupSchema),
  contradictions: z.array(z.string()),
  connections: z.array(z.string()),
  decision: z.union([
    z.object({ action: z.literal("deliver") }),
    z.object({ action: z.literal("dig_deeper"), tasks: z.array(orchestratorTaskSchema) }),
  ]),
});

const bodySchema = z.object({
  phase: z.enum(["plan", "review", "deliver"]),
  objective: z.string().min(1),
  subject_scope: z.string().max(12_000).optional(),
  conversation_context: z.string().optional(),
  user_preferences_summary: z.string().optional(),
  research_hygiene: z.record(z.string(), z.unknown()).optional(),
  prior_key_findings: z.record(z.string(), z.unknown()).optional(),
  prior_dimensions: z.array(researchDimensionSchema).optional(),
  prior_known_gaps: z.array(knownGapGroupSchema).optional(),
  plan: planOutputSchema.optional(),
  all_worker_results: z.array(workerOutputSchema).optional(),
  prior_review: reviewOutputSchema.optional(),
  final_review: reviewOutputSchema.optional(),
  round: z.number().int().min(1).max(5).optional(),
  max_rounds: z.number().int().min(1).max(5).optional(),
  rounds_completed: z.number().int().min(1).optional(),
});

export const maxDuration = 120;

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
  const config: PipelineConfig = { ...DEFAULT_PIPELINE_CONFIG };

  let prefsSummary = b.user_preferences_summary ?? "";
  if (!prefsSummary) {
    const domain_manual = await loadWorkspaceDomainManualOrDefault();
    const userPrefs = readUserPreferences(domain_manual);
    prefsSummary = extractApplicablePreferences(userPrefs, b.objective, []);
  }

  try {
    if (b.phase === "plan") {
      const domain_manual = await loadWorkspaceDomainManualOrDefault();
      const result = await orchestratorPlan({
        objective: b.objective,
        subject_scope: b.subject_scope,
        domain_manual,
        conversation_context: b.conversation_context ?? "",
        user_preferences_summary: prefsSummary,
        research_hygiene: b.research_hygiene,
        prior_key_findings: b.prior_key_findings,
        prior_dimensions: b.prior_dimensions,
        prior_known_gaps: b.prior_known_gaps,
        config,
      });
      return NextResponse.json(result);
    }

    if (b.phase === "review") {
      if (!b.plan) {
        return NextResponse.json({ error: "review phase requires plan" }, { status: 400 });
      }
      if (!b.all_worker_results?.length) {
        return NextResponse.json({ error: "review phase requires all_worker_results" }, { status: 400 });
      }
      const result = await orchestratorReview({
        objective: b.objective,
        subject_scope: b.subject_scope,
        user_preferences_summary: prefsSummary,
        plan: b.plan as import("@/lib/types").OrchestratorPlanOutput,
        all_worker_results: b.all_worker_results as unknown as import("@/lib/types").WorkerOutput[],
        round: b.round ?? 1,
        max_rounds: b.max_rounds ?? 3,
        prior_review: b.prior_review as import("@/lib/types").OrchestratorReviewOutput | undefined,
        config,
      });
      return NextResponse.json(result);
    }

    if (b.phase === "deliver") {
      if (!b.plan) {
        return NextResponse.json({ error: "deliver phase requires plan" }, { status: 400 });
      }
      if (!b.all_worker_results?.length) {
        return NextResponse.json({ error: "deliver phase requires all_worker_results" }, { status: 400 });
      }
      if (!b.final_review) {
        return NextResponse.json({ error: "deliver phase requires final_review" }, { status: 400 });
      }
      const result = await orchestratorDeliver({
        objective: b.objective,
        subject_scope: b.subject_scope,
        user_preferences_summary: prefsSummary,
        plan: b.plan as import("@/lib/types").OrchestratorPlanOutput,
        all_worker_results: b.all_worker_results as unknown as import("@/lib/types").WorkerOutput[],
        final_review: b.final_review as unknown as import("@/lib/types").OrchestratorReviewOutput,
        rounds_completed: b.rounds_completed ?? 1,
        config,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown phase" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Orchestrator failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
