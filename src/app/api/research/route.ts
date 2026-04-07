import { NextResponse } from "next/server";
import { z } from "zod";

const supportAngleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

const decompositionSchema = z.object({
  core_query: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  support_angles: z.array(supportAngleSchema).min(2).max(6),
});

const bodySchema = z.object({
  decomposition: decompositionSchema,
  yearRange: z.string().optional(),
});

/**
 * POST `{ "decomposition": QueryDecomposition, "yearRange"?: string }`
 * → Agent 2 search queries (stub until `strategicResearch.ts` is wired in task 5.2).
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
        error: "Invalid body: expected { decomposition: QueryDecomposition, yearRange?: string }",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  // Task 5.2: call strategicResearch agent with parsed.data.decomposition + parsed.data.yearRange

  return NextResponse.json(
    {
      error:
        "Agent 2 (Strategic Research) is not implemented yet. Complete task 5.2 (`lib/agents/strategicResearch.ts`) and wire this route.",
      received: {
        core_query: parsed.data.decomposition.core_query,
        angleIds: parsed.data.decomposition.support_angles.map((a) => a.id),
        yearRange: parsed.data.yearRange ?? null,
      },
    },
    { status: 501 },
  );
}
