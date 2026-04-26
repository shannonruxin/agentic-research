import { NextResponse } from "next/server";
import { z } from "zod";
import { runParallelPipeline } from "@/lib/agents/runParallelPipeline";

const bodySchema = z.object({
  objective: z.string().min(1),
  subject_scope: z.string().max(12_000).optional(),
  research_hygiene: z.record(z.string(), z.unknown()).optional(),
  max_rounds: z.number().int().min(1).max(5).optional(),
});

export const maxDuration = 300;

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
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const b = parsed.data;

  try {
    const result = await runParallelPipeline({
      objective: b.objective,
      subject_scope: b.subject_scope,
      research_hygiene: b.research_hygiene,
      max_rounds: b.max_rounds,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error, steps: result.steps }, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Pipeline failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
