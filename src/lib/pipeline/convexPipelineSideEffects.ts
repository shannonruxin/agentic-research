import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Agent3EvidencePlan } from "@/lib/types";
import type { EvidenceSegment } from "@/lib/types";

function createConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url?.trim()) {
    return null;
  }
  return new ConvexHttpClient(url.trim(), { logger: false });
}

function adminAuth(client: ConvexHttpClient): void {
  const key = process.env.CONVEX_ADMIN_KEY?.trim();
  if (key) {
    (client as ConvexHttpClient & { setAdminAuth: (token: string) => void }).setAdminAuth(key);
  }
}

/**
 * Best-effort Convex: never throws; no-ops when URL / run id missing.
 */
export async function bestEffortPersistEvidenceSegments(
  pipelineRunId: string | undefined,
  evidence_segments: EvidenceSegment[],
): Promise<void> {
  if (!pipelineRunId?.trim()) return;
  const client = createConvexClient();
  if (!client) return;
  try {
    adminAuth(client);
    await client.mutation(api.pipelineRuns.setEvidenceSegments, {
      run_id: pipelineRunId as Id<"pipeline_runs">,
      evidence_segments,
    });
  } catch {
    /* best-effort */
  }
}

export async function bestEffortPersistAgent3Plan(
  pipelineRunId: string | undefined,
  agent3_plan: Agent3EvidencePlan,
): Promise<void> {
  if (!pipelineRunId?.trim()) return;
  const client = createConvexClient();
  if (!client) return;
  try {
    adminAuth(client);
    await client.mutation(api.pipelineRuns.setAgent3Plan, {
      run_id: pipelineRunId as Id<"pipeline_runs">,
      agent3_plan,
    });
  } catch {
    /* best-effort */
  }
}

export async function bestEffortLogAgentStage(
  pipelineRunId: string | undefined,
  agent: string,
  status: "ok" | "error" | "rejected",
  detail: { input_summary: string; output_summary?: string; error?: string },
): Promise<void> {
  if (!pipelineRunId?.trim()) return;
  const client = createConvexClient();
  if (!client) return;
  try {
    adminAuth(client);
    await client.mutation(api.agentLogs.logAgentEvent, {
      pipeline_run_id: pipelineRunId as Id<"pipeline_runs">,
      agent,
      status,
      input_summary: detail.input_summary,
      output_summary: detail.output_summary,
      error: detail.error,
    });
  } catch {
    /* best-effort */
  }
}
