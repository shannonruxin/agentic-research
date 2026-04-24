import { NextResponse } from "next/server";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import {
  Agent3ResearchPlanError,
  agent3ResearchPlanSchema,
  generateAgent3ResearchPlan,
  type Agent36PriorRound,
} from "@/lib/agents/agent3ResearchPlan";
import { agent3TaskResultSchema, agent6ResultBodySchema } from "@/lib/agents/agent3ResearchTask";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const priorRoundSchema = z.object({
  agent3_plan: agent3ResearchPlanSchema,
  agent6_result: agent6ResultBodySchema,
  agent3_review: agent3TaskResultSchema,
});

const bodySchema = z.object({
  research_task: agent7ResearchTaskSchema,
  domain_manual: jsonObjectSchema.optional(),
  research_hygiene: jsonObjectSchema.optional(),
  prior_rounds: z.array(priorRoundSchema).max(8).optional(),
  research_log: z.array(z.record(z.string(), z.unknown())).max(24).optional(),
  iteration_hint: z.string().max(4000).optional(),
});

export const maxDuration = 300;

/**
 * POST `{ research_task, domain_manual?, research_hygiene?, prior_rounds?, research_log?, iteration_hint? }`
 * → **`Agent3ResearchPlan`**
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
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const prior = parsed.data.prior_rounds as Agent36PriorRound[] | undefined;
    const result = await generateAgent3ResearchPlan({
      research_task: parsed.data.research_task,
      domain_manual: parsed.data.domain_manual,
      research_hygiene: parsed.data.research_hygiene,
      prior_rounds: prior,
      research_log: parsed.data.research_log as import("@/lib/types").Agent3ResearchLogEntry[] | undefined,
      iteration_hint: parsed.data.iteration_hint,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Agent3ResearchPlanError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 3 research plan failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
