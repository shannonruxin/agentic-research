import { NextResponse } from "next/server";
import { z } from "zod";
import { agent7DimensionSchema } from "@/lib/agents/agent7Orchestrate";
import { Agent7ResearchCycleError } from "@/lib/agents/agent7ResearchCycle";
import { runAgent73OrchestrationLoop } from "@/lib/agents/runAgent73OrchestrationLoop";
import { Agent3Phase2Error } from "@/lib/agents/agent3Phase2";
import { Agent6ResearchTaskError } from "@/lib/agents/agent6ResearchTask";
import { Agent3ResearchPlanError } from "@/lib/agents/agent3ResearchPlan";
import { Agent3ResearchTaskError } from "@/lib/agents/agent3ResearchTask";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const knownGapGroupBodySchema = z.object({
  dimension: z.string().optional(),
  gaps: z.array(z.string().min(1)).min(1),
});

const bodySchema = z.object({
  objective: z.string().min(1),
  subject_scope: z.string().max(12_000).optional(),
  /** Omit or `{}` to use `workspace/domain_manual.json`. */
  domain_manual: jsonObjectSchema.optional(),
  research_hygiene: jsonObjectSchema.optional(),
  memory: jsonObjectSchema.optional(),
  known_gaps_seed: z.array(knownGapGroupBodySchema).optional(),
  key_findings: jsonObjectSchema.optional(),
  dimensions: z.array(agent7DimensionSchema).min(1).max(16).optional(),
  max_outer_iterations: z.number().int().min(1).max(50).optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  max_iterations_3_6: z.number().int().min(1).max(20).optional(),
});

export const maxDuration = 800;

/**
 * Run Agent 7 ↔ Agent 3/6 until delivery or cap. Writes `workspace/sandbox-73-memory.json` and
 * `workspace/user-output.md` on the server. (Use the Research tab for `chat-memory.json` turn log.)
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
        error: "Invalid request body",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const b = parsed.data;
  const maxOuter = b.max_outer_iterations ?? 5;
  const max36 = b.max_iterations_3_6 ?? 3;

  try {
    const result = await runAgent73OrchestrationLoop({
      objective: b.objective,
      subject_scope: b.subject_scope,
      domain_manual: b.domain_manual,
      research_hygiene: b.research_hygiene,
      memoryJson: b.memory,
      known_gaps_seed: b.known_gaps_seed,
      key_findings: b.key_findings,
      dimensions: b.dimensions,
      max_outer_iterations: maxOuter,
      min_confidence_3_6: b.min_confidence,
      max_iterations_3_6: max36,
      persistence: "sandbox",
    });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, steps: result.steps },
        { status: 502 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Agent7ResearchCycleError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    if (e instanceof Agent6ResearchTaskError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    if (e instanceof Agent3Phase2Error) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    if (e instanceof Agent3ResearchPlanError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    if (e instanceof Agent3ResearchTaskError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 7/3 loop failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
