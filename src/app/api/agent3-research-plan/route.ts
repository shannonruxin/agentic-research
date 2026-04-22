import { NextResponse } from "next/server";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import {
  Agent3ResearchPlanError,
  agent3ResearchPlanSchema,
  applyPriorReviewToAgent3Plan,
  generateAgent3ResearchPlan,
  type Agent36PriorRound,
} from "@/lib/agents/agent3ResearchPlan";
import { agent3TaskResultSchema } from "@/lib/agents/agent3ResearchTask";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const priorRoundSchema = z.object({
  agent3_plan: agent3ResearchPlanSchema,
  agent6_result: z.object({
    queries_used: z.array(z.string()),
    source_urls: z.array(z.string()),
    extracted_key_data: z.array(
      z.object({
        variable: z.string(),
        status: z.enum(["found", "partial", "not_found"]),
        value_summary: z.string(),
        supporting_snippet: z.string().optional(),
        source_url: z.string().optional(),
      }),
    ),
    parallel_search_id: z.string().nullable().optional(),
  }),
  agent3_review: agent3TaskResultSchema,
});

const bodySchema = z.object({
  research_task: agent7ResearchTaskSchema,
  domain_manual: jsonObjectSchema.optional(),
  research_hygiene: jsonObjectSchema.optional(),
  prior_rounds: z.array(priorRoundSchema).max(8).optional(),
  iteration_hint: z.string().max(4000).optional(),
});

export const maxDuration = 300;

/**
 * POST `{ research_task, domain_manual?, research_hygiene?, prior_rounds?, iteration_hint? }`
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
    const raw = await generateAgent3ResearchPlan({
      research_task: parsed.data.research_task,
      domain_manual: parsed.data.domain_manual,
      research_hygiene: parsed.data.research_hygiene,
      prior_rounds: prior,
      iteration_hint: parsed.data.iteration_hint,
    });
    const lastReview =
      prior && prior.length > 0 ? prior[prior.length - 1]!.agent3_review : undefined;
    const result = applyPriorReviewToAgent3Plan(raw, lastReview);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Agent3ResearchPlanError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 3 research plan failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
