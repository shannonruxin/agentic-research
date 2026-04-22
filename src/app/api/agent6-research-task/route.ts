import { NextResponse } from "next/server";
import { z } from "zod";
import { agent7ResearchTaskSchema } from "@/lib/agents/agent7Orchestrate";
import { Agent6ResearchTaskError, runAgent6ResearchTask } from "@/lib/agents/agent6ResearchTask";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const iterationExtensionSchema = z
  .object({
    additional_queries: z.array(z.string()).optional(),
    objective_suffix: z.string().optional(),
  })
  .optional();

const agent3AssignmentSchema = z.object({
  search_objective: z.string().min(1),
  search_queries: z.array(z.string().min(1)).min(1).max(14),
  extraction_notes: z.string().optional(),
});

/** Accept flat assignment or full plan `{ plan_summary, agent6_assignment, open_questions? }`. */
const agent3AssignmentInBody = z.preprocess(
  (val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val !== "object" || Array.isArray(val)) return val;
    const o = val as Record<string, unknown>;
    if (
      o.agent6_assignment !== null &&
      typeof o.agent6_assignment === "object" &&
      !Array.isArray(o.agent6_assignment)
    ) {
      return o.agent6_assignment;
    }
    return val;
  },
  agent3AssignmentSchema.optional(),
);

const bodySchema = z.object({
  research_task: agent7ResearchTaskSchema,
  domain_manual: jsonObjectSchema.optional(),
  research_hygiene: jsonObjectSchema.optional(),
  /** From Agent 3 **plan** — when set, drives Parallel search (recommended). */
  agent3_assignment: agent3AssignmentInBody,
  iteration_extension: iterationExtensionSchema,
});

export const maxDuration = 300;

/**
 * POST `{ research_task, domain_manual?, research_hygiene?, agent3_assignment?, iteration_extension? }`
 * → **`Agent6ResearchRunResult`**
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
    const result = await runAgent6ResearchTask(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Agent6ResearchTaskError) {
      const msg = e.message;
      const isConfig = /PARALLEL_API_KEY|not set/i.test(msg);
      return NextResponse.json({ error: msg }, { status: isConfig ? 503 : 502 });
    }
    const message = e instanceof Error ? e.message : "Agent 6 research task failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
