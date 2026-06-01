import { NextResponse } from "next/server";
import { z } from "zod";
import { orchestratorPlan, orchestratorDeliver } from "@/lib/agents/orchestrator";
import type { ActiveFindingForOrchestrator, OrchestratorServices } from "@/lib/agents/orchestrator";
import { researchDimensionSchema, knownGapGroupSchema } from "@/lib/agents/dimensionSchemas";
import { loadWorkspaceDomainManualOrDefault } from "@/lib/workspaceNode";
import { readUserPreferences } from "@/lib/preferenceUtils";
import { extractApplicablePreferences } from "@/lib/agents/preferencesAgent";
import { DEFAULT_PIPELINE_CONFIG } from "@/lib/types";
import type { PipelineConfig } from "@/lib/types";

const workerOutputSchema = z.object({
  task_id: z.string(),
  dimension: z.string(),
  factor: z.string(),
  summary: z.string(),
  sources: z.array(z.object({
    url: z.string(),
    title: z.string().optional(),
    relevance: z.string(),
    data_noted: z.string(),
  })),
  extracted_data: z.array(z.record(z.string(), z.unknown())),
  confidence: z.number(),
  gaps_remaining: z.array(z.string()),
  search_queries_used: z.array(z.string()),
  rabbithole_leads: z.array(z.string()).optional(),
});

const thesisEvolutionEntrySchema = z.object({
  turn: z.number(),
  round: z.number(),
  investment_thesis: z.string(),
  dimensions: z.array(researchDimensionSchema),
  known_gaps: z.array(knownGapGroupSchema),
  key_findings: z.record(z.string(), z.string()),
  notes: z.string(),
  connections: z.array(z.string()),
  contradictions: z.array(z.string()),
});

const thesisEvolutionFileSchema = z.object({
  rounds: z.array(thesisEvolutionEntrySchema),
});

const bodySchema = z.object({
  phase: z.enum(["plan", "deliver"]),
  objective: z.string().min(1),
  subject_scope: z.string().max(12_000).optional(),
  user_preferences_summary: z.string().optional(),
  // plan inputs
  thesis_evolution: thesisEvolutionFileSchema.optional(),
  chat_history: z.array(z.string()).optional(),
  dimension_status: z.record(z.string(), z.enum(["active", "inactive"])).optional(),
  inactive_dimension_summaries: z.array(z.object({
    dimensionId: z.string(),
    summary: z.string(),
  })).optional(),
  // deliver inputs
  active_findings: z.array(z.object({
    dimension: z.string(),
    factor: z.string(),
    task_id: z.string(),
    round: z.number(),
    confidence: z.number(),
    summary: z.string(),
    gaps_remaining: z.array(z.string()),
    rabbithole_leads: z.array(z.string()),
  })).optional(),
  // worker_results accepted for sandbox convenience — converted to active_findings internally
  all_worker_results: z.array(workerOutputSchema).optional(),
  inactive_summaries: z.array(z.object({
    dimensionId: z.string(),
    summary: z.string(),
  })).optional(),
  connection_insights: z.string().optional(),
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

  // Convert all_worker_results to active_findings format when active_findings not provided
  function resolveActiveFindings(): ActiveFindingForOrchestrator[] {
    if (b.active_findings) return b.active_findings;
    if (!b.all_worker_results?.length) return [];
    return b.all_worker_results.map((wr) => ({
      dimension: wr.dimension,
      factor: wr.factor,
      task_id: wr.task_id,
      round: 1,
      confidence: wr.confidence,
      summary: wr.summary,
      gaps_remaining: wr.gaps_remaining,
      rabbithole_leads: wr.rabbithole_leads ?? [],
    }));
  }

  try {
    if (b.phase === "plan") {
      const domain_manual = await loadWorkspaceDomainManualOrDefault();
      const services: OrchestratorServices = {
        domain_manual: Object.keys(domain_manual).length > 0 ? domain_manual : undefined,
      };
      const result = await orchestratorPlan({
        objective: b.objective,
        subject_scope: b.subject_scope,
        services,
        user_preferences_summary: prefsSummary,
        thesis_evolution: b.thesis_evolution ?? { rounds: [] },
        chat_history: b.chat_history ?? [],
        dimension_status: b.dimension_status ?? {},
        inactive_dimension_summaries: b.inactive_dimension_summaries ?? [],
        active_dimension_files: {},
        round: 1,
        config,
      });
      return NextResponse.json(result);
    }

    if (b.phase === "deliver") {
      const activeFindings = resolveActiveFindings();
      const result = await orchestratorDeliver({
        objective: b.objective,
        subject_scope: b.subject_scope,
        user_preferences_summary: prefsSummary,
        thesis_evolution: b.thesis_evolution ?? { rounds: [] },
        active_findings: activeFindings,
        inactive_summaries: b.inactive_summaries ?? [],
        connection_insights: b.connection_insights ?? "",
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
