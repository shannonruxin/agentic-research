import { NextResponse } from "next/server";
import { z } from "zod";
import {
  Agent7ModelError,
  agent7DimensionSchema,
  orchestrateAgent7,
} from "@/lib/agents/agent7Orchestrate";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const knownGapGroupBodySchema = z.object({
  dimension: z.string().optional(),
  gaps: z.array(z.string().min(1)).min(1),
});

const bodySchema = z.object({
  objective: z.string().min(1),
  domain_manual: jsonObjectSchema,
  research_hygiene: jsonObjectSchema.optional(),
  memory: jsonObjectSchema.optional(),
  known_gaps_seed: z.array(knownGapGroupBodySchema).optional(),
  key_findings: jsonObjectSchema.optional(),
  dimensions: z.array(agent7DimensionSchema).min(1).max(16).optional(),
});

export const maxDuration = 300;

/**
 * POST body: objective, domain_manual, research_hygiene?, memory?, known_gaps_seed?, key_findings?, dimensions?
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
          "Invalid body: expected { objective, domain_manual, research_hygiene?, memory?, known_gaps_seed?, key_findings?, dimensions? }",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { objective, domain_manual, research_hygiene, memory, known_gaps_seed, key_findings, dimensions } =
    parsed.data;

  try {
    const result = await orchestrateAgent7({
      objective,
      domain_manual,
      research_hygiene,
      memory,
      known_gaps_seed,
      key_findings,
      dimensions,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Agent7ModelError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 7 orchestration failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
