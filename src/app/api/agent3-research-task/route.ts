import { NextResponse } from "next/server";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import {
  Agent3ResearchTaskError,
  generateAgent3ResearchTaskResult,
} from "@/lib/agents/agent3ResearchTask";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const agent6ResultSchema = z.object({
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
});

const bodySchema = z.object({
  research_task: agent7ResearchTaskSchema,
  agent6_result: agent6ResultSchema,
  domain_manual: jsonObjectSchema.optional(),
  research_hygiene: jsonObjectSchema.optional(),
  iteration_hint: z.string().max(4000).optional(),
});

export const maxDuration = 300;

/**
 * POST `{ research_task, agent6_result, domain_manual?, research_hygiene?, iteration_hint? }`
 * → **`Agent3TaskResult`**
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
    const result = await generateAgent3ResearchTaskResult(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Agent3ResearchTaskError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 3 research task failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
