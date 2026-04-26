import { NextResponse } from "next/server";
import { z } from "zod";
import { runSynthesizer } from "@/lib/agents/synthesizer";
import { agent7DimensionSchema, knownGapGroupSchema } from "@/lib/agents/agent7Orchestrate";
import { loadWorkspaceDomainManualOrDefault } from "@/lib/workspaceNode";

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

const bodySchema = z.object({
  objective: z.string().min(1),
  subject_scope: z.string().max(12_000).optional(),
  worker_results: z.array(workerOutputSchema).min(1),
  research_hygiene: z.record(z.string(), z.unknown()).optional(),
  user_preferences_summary: z.string().optional(),
  round: z.number().int().min(1).max(5).optional(),
  max_rounds: z.number().int().min(1).max(5).optional(),
  prior_key_findings: z.record(z.string(), z.unknown()).optional(),
  prior_dimensions: z.array(agent7DimensionSchema).optional(),
  prior_known_gaps: z.array(knownGapGroupSchema).optional(),
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
  const domain_manual = await loadWorkspaceDomainManualOrDefault();

  try {
    const result = await runSynthesizer({
      objective: b.objective,
      subject_scope: b.subject_scope,
      domain_manual,
      worker_results: b.worker_results as unknown as import("@/lib/types").WorkerOutput[],
      user_preferences_summary: b.user_preferences_summary ?? "",
      research_hygiene: b.research_hygiene,
      prior_key_findings: b.prior_key_findings,
      prior_dimensions: b.prior_dimensions,
      prior_known_gaps: b.prior_known_gaps,
      round: b.round,
      max_rounds: b.max_rounds,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Synthesizer failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
