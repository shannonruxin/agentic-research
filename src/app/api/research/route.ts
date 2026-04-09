import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateStrategicResearch,
  StrategicResearchModelError,
  StrategicResearchValidationError,
} from "@/lib/agents/strategicResearch";

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
 * → `SearchQueries` (per-angle `StrategyQueryItem[]`).
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

  const ids = parsed.data.decomposition.support_angles.map((a) => a.id);
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json(
      { error: "decomposition.support_angles must have unique id values" },
      { status: 400 },
    );
  }

  try {
    const result = await generateStrategicResearch(
      parsed.data.decomposition,
      parsed.data.yearRange,
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof StrategicResearchValidationError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    if (e instanceof StrategicResearchModelError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Strategic research failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
