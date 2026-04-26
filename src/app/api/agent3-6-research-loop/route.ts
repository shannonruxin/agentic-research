import { NextResponse } from "next/server";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import { Agent3Phase2Error } from "@/lib/agents/agent3Phase2";
import { Agent3ResearchPlanError } from "@/lib/agents/agent3ResearchPlan";
import { Agent3ResearchTaskError } from "@/lib/agents/agent3ResearchTask";
import { Agent6ResearchTaskError } from "@/lib/agents/agent6ResearchTask";
import { HARD_CAP_AGENT36_ITERATIONS, runAgent36ResearchLoop } from "@/lib/agents/agent36ResearchLoop";
import { domainManualForAgent3Task } from "@/lib/domainManualPolicy";
import { loadWorkspaceDomainManualOrDefault } from "@/lib/workspaceNode";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const bodySchema = z.object({
  research_task: agent7ResearchTaskSchema,
  research_hygiene: jsonObjectSchema.optional(),
  research_log: z.array(z.record(z.string(), z.unknown())).max(24).optional(),
  max_iterations: z.number().int().min(1).max(HARD_CAP_AGENT36_ITERATIONS).optional(),
  /** 0–1; optional floor on review `confidence.score` to end early. */
  min_confidence: z.number().min(0).max(1).optional(),
});

export const maxDuration = 300;

/**
 * POST `{ research_task, research_hygiene?, max_iterations? }`
 * → **`Agent36ResearchLoopResponse`**
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
    const workspaceManual = await loadWorkspaceDomainManualOrDefault();
    const domain_manual = domainManualForAgent3Task(workspaceManual, parsed.data.research_task);
    const result = await runAgent36ResearchLoop({
      ...parsed.data,
      domain_manual,
      research_log: parsed.data.research_log as import("@/lib/types").Agent3ResearchLogEntry[] | undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Agent6ResearchTaskError) {
      const msg = e.message;
      const isConfig = /PARALLEL_API_KEY|not set/i.test(msg);
      return NextResponse.json({ error: msg }, { status: isConfig ? 503 : 502 });
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
    const message = e instanceof Error ? e.message : "Agent 3–6 research loop failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
