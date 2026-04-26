import { NextResponse } from "next/server";
import { z } from "zod";
import { plannerTaskSchema } from "@/lib/agents/planner";
import { runResearchWorker } from "@/lib/agents/researchWorker";

const bodySchema = z.object({
  task: plannerTaskSchema,
  domain_manual: z.record(z.string(), z.unknown()).optional(),
  research_hygiene: z.record(z.string(), z.unknown()).optional(),
  user_preferences_summary: z.string().optional(),
  profile_context: z.string().optional(),
});

export const maxDuration = 120;

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
    const result = await runResearchWorker({
      task: b.task,
      domain_manual: b.domain_manual,
      research_hygiene: b.research_hygiene,
      user_preferences_summary: b.user_preferences_summary ?? "",
      profile_context: b.profile_context,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Worker failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
