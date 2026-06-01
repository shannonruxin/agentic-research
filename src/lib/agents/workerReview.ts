/**
 * workerReview.ts
 *
 * Per-worker, per-dimension review agent.
 * Fires immediately when a worker completes.
 * Grades the worker's output and decides if a follow-up task is needed.
 * No global context — only sees its own dimension.
 */

import { generateText } from "ai";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import type { PlannerResearchTask, WorkerOutput, WorkerReviewOutput } from "@/lib/types";
import type { SessionWorkerFinding } from "@/lib/sessionStorage";

const SYSTEM = `You are a research quality reviewer. You assess whether a research worker has adequately answered their assigned task goal, given prior findings for the same dimension.

Your job:
1. Read the task goal
2. Read what the worker found
3. Check whether the finding actually answers the goal, given what was already known
4. Decide: sufficient (the goal is answered well enough) or needs_followup (a material gap remains)

Rules:
- Be strict: "sufficient" means the goal is genuinely answered, not just attempted
- "needs_followup" only if the gap is MATERIAL to the research objective — don't chase minor details
- If follow-up is needed, provide ONE specific, focused task — not a list
- No confidence scores. Binary verdict only, backed by qualitative reasoning.`;

function buildReviewPrompt(input: {
  objective: string;
  dimension: { id: string; label: string; description?: string };
  task: PlannerResearchTask;
  worker_output: WorkerOutput;
  dimension_findings: SessionWorkerFinding[];
  follow_up_budget: number;
}): string {
  const parts: string[] = [
    `Research objective: ${input.objective}`,
    "",
    `Dimension under review: ${input.dimension.label} (${input.dimension.id})`,
    input.dimension.description ? `Description: ${input.dimension.description}` : "",
    "",
    "Task that was just completed:",
    `  Goal: ${input.task.goal}`,
    `  Factor: ${input.task.factor}`,
    "",
    "Worker output:",
    `  Summary: ${input.worker_output.summary}`,
    `  Gaps remaining: ${input.worker_output.gaps_remaining.length > 0 ? input.worker_output.gaps_remaining.join("; ") : "none reported"}`,
    `  Leads: ${input.worker_output.rabbithole_leads?.join("; ") ?? "none"}`,
    "",
  ];

  if (input.dimension_findings.length > 1) {
    parts.push("Prior findings for this dimension (excluding the one just submitted):");
    const prior = input.dimension_findings.slice(0, -1); // exclude last (just written)
    for (const f of prior) {
      parts.push(`  [Round ${f.round}] Factor: ${f.factor}`);
      parts.push(`  Summary: ${f.summary.slice(0, 400)}${f.summary.length > 400 ? "…" : ""}`);
      parts.push("");
    }
  }

  if (input.follow_up_budget <= 0) {
    parts.push("NOTE: Follow-up budget is exhausted. You MUST return verdict: sufficient.");
    parts.push("");
  }

  parts.push(
    'Respond with a JSON object:',
    '{',
    '  "verdict": "sufficient" or "needs_followup",',
    '  "assessment": "string — what was found, what is still missing, why it matters or doesn\'t",',
    '  "follow_up_task": {',
    '    "task_id": "string",',
    '    "dimension": "string",',
    '    "factor": "string",',
    '    "goal": "string",',
    '    "search_guidance": ["string"],',
    '    "priority": "high|medium|low"',
    '  } or null',
    '}',
    "",
    "Output ONLY the JSON object.",
  );

  return parts.filter((line) => line !== undefined).join("\n");
}

function parseReviewOutput(raw: Record<string, unknown>, task: PlannerResearchTask): WorkerReviewOutput {
  const verdict = raw.verdict === "needs_followup" ? "needs_followup" as const : "sufficient" as const;
  const assessment = typeof raw.assessment === "string" ? raw.assessment.trim() : "";

  let follow_up_task: PlannerResearchTask | null = null;
  if (verdict === "needs_followup" && raw.follow_up_task && typeof raw.follow_up_task === "object" && !Array.isArray(raw.follow_up_task)) {
    const t = raw.follow_up_task as Record<string, unknown>;
    follow_up_task = {
      task_id: typeof t.task_id === "string" && t.task_id.trim() ? t.task_id.trim() : `followup_${task.task_id}`,
      dimension: typeof t.dimension === "string" && t.dimension.trim() ? t.dimension.trim() : task.dimension,
      factor: typeof t.factor === "string" && t.factor.trim() ? t.factor.trim() : task.factor,
      goal: typeof t.goal === "string" ? t.goal.trim() : "",
      search_guidance: Array.isArray(t.search_guidance)
        ? (t.search_guidance as unknown[]).filter((s): s is string => typeof s === "string" && s.trim() !== "")
        : [],
      priority: (t.priority === "high" || t.priority === "medium" || t.priority === "low") ? t.priority : "medium",
    };
  }

  return { verdict, assessment, follow_up_task };
}

export async function runWorkerReview(input: {
  objective: string;
  dimension: { id: string; label: string; description?: string };
  task: PlannerResearchTask;
  worker_output: WorkerOutput;
  dimension_findings: SessionWorkerFinding[];
  follow_up_budget: number;
}): Promise<WorkerReviewOutput> {
  if (input.follow_up_budget <= 0) {
    return {
      verdict: "sufficient",
      assessment: "Follow-up budget exhausted — dimension accepted as-is.",
      follow_up_task: null,
    };
  }

  const model = createBedrockLanguageModel();
  const prompt = buildReviewPrompt(input);

  const { text } = await generateText({
    model,
    system: SYSTEM,
    prompt,
    temperature: 0.1,
    maxOutputTokens: 1000,
  });

  // Parse JSON from LLM output
  let str = text.trim();
  const fence = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) str = fence[1]!.trim();
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  if (start !== -1 && end > start) str = str.slice(start, end + 1);

  try {
    const raw = JSON.parse(str) as Record<string, unknown>;
    return parseReviewOutput(raw, input.task);
  } catch {
    // If parse fails, default to sufficient to avoid infinite loops
    return {
      verdict: "sufficient",
      assessment: "Review output could not be parsed — accepting worker output.",
      follow_up_task: null,
    };
  }
}
