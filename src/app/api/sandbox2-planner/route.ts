import { NextResponse } from "next/server";
import { z } from "zod";
import { runPlanner } from "@/lib/agents/planner";
import { agent7DimensionSchema, knownGapGroupSchema } from "@/lib/agents/agent7Orchestrate";
import { loadWorkspaceDomainManualOrDefault } from "@/lib/workspaceNode";
import { readUserPreferences } from "@/lib/preferenceUtils";
import { extractApplicablePreferences } from "@/lib/agents/preferencesAgent";

const bodySchema = z.object({
  objective: z.string().min(1),
  subject_scope: z.string().max(12_000).optional(),
  research_hygiene: z.record(z.string(), z.unknown()).optional(),
  conversation_context: z.string().optional(),
  user_preferences_summary: z.string().optional(),
  prior_key_findings: z.record(z.string(), z.unknown()).optional(),
  prior_dimensions: z.array(agent7DimensionSchema).optional(),
  prior_known_gaps: z.array(knownGapGroupSchema).optional(),
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
  const domain_manual = await loadWorkspaceDomainManualOrDefault();

  let prefsSummary = b.user_preferences_summary ?? "";
  if (!prefsSummary) {
    const userPrefs = readUserPreferences(domain_manual);
    prefsSummary = extractApplicablePreferences(userPrefs, b.objective, []);
  }

  try {
    const result = await runPlanner({
      objective: b.objective,
      subject_scope: b.subject_scope,
      domain_manual,
      conversation_context: b.conversation_context ?? "",
      user_preferences_summary: prefsSummary,
      research_hygiene: b.research_hygiene,
      prior_key_findings: b.prior_key_findings,
      prior_dimensions: b.prior_dimensions,
      prior_known_gaps: b.prior_known_gaps,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Planner failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
