import { NextResponse } from "next/server";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import {
  Agent3ResearchTaskError,
  generateAgent3ResearchTaskResult,
  agent6ResultBodySchema,
} from "@/lib/agents/agent3ResearchTask";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const bodySchema = z.object({
  research_task: agent7ResearchTaskSchema,
  agent6_result: agent6ResultBodySchema,
  domain_manual: jsonObjectSchema.optional(),
  research_hygiene: jsonObjectSchema.optional(),
  research_log: z.array(z.record(z.string(), z.unknown())).max(24).optional(),
  iteration_hint: z.string().max(4000).optional(),
});

export const maxDuration = 300;

/**
 * POST `{ research_task, agent6_result, domain_manual?, research_hygiene?, research_log?, iteration_hint? }`
 * → **`Agent3Phase2Response`** (plan fields + review; progress_metrics / entity_tracking when returned).
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
    const result = await generateAgent3ResearchTaskResult({
      ...parsed.data,
      research_log: parsed.data.research_log as import("@/lib/types").Agent3ResearchLogEntry[] | undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Agent3ResearchTaskError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 3 research task failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
