import { NextResponse } from "next/server";
import { z } from "zod";
import { runParallelPipeline } from "@/lib/agents/runParallelPipeline";

const pipelineConfigSchema = z
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
  .optional();

const bodySchema = z.object({
  objective: z.string().min(1),
  subject_scope: z.string().max(12_000).optional(),
  pipeline_config: pipelineConfigSchema,
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
      objective: b.objective,
      subject_scope: b.subject_scope,
      pipeline_config: b.pipeline_config,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error, steps: result.steps }, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Pipeline failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
