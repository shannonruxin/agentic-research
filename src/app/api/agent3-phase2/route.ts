import { NextResponse } from "next/server";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import { Agent3Phase2Error, generateAgent3Phase2 } from "@/lib/agents/agent3Phase2";
import { agent6ResultBodySchema } from "@/lib/agents/agent3ResearchTask";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const bodySchema = z.object({
  research_task: agent7ResearchTaskSchema,
  domain_manual: jsonObjectSchema.optional(),
  research_hygiene: jsonObjectSchema.optional(),
  agent6_result: agent6ResultBodySchema.optional(),
  research_log: z.array(z.record(z.string(), z.unknown())).max(24).optional(),
  iteration_hint: z.string().max(4000).optional(),
});

export const maxDuration = 300;

/**
 * POST unified Agent 3 Phase 2 — planning only without **`agent6_result`**; full plan + review when **`agent6_result`** is set.
 * → **`Agent3Phase2Response`** (includes **`scan`**, **`insight`**, **`decision`** on review passes).
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
    const result = await generateAgent3Phase2({
      research_task: parsed.data.research_task,
      domain_manual: parsed.data.domain_manual,
      research_hygiene: parsed.data.research_hygiene,
      agent6_result: parsed.data.agent6_result,
      research_log: parsed.data.research_log as import("@/lib/types").Agent3ResearchLogEntry[] | undefined,
      iteration_hint: parsed.data.iteration_hint,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Agent3Phase2Error) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 3 Phase 2 failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
