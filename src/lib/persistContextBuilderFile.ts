import { writeWorkspaceText, CONTEXT_BUILDER_FILE } from "@/lib/workspaceNode";

/**
 * Overwritten on each Agent 7 `generateObject` (research loop + max-iter finalize).
 * `system` and `user` are the **literal** strings sent to the model; `userByteLength` is derived (UTF-8).
 */
export type ContextBuilderFileContents =
  | {
      kind: "research_cycle";
      updatedAt: string;
      modelCall: { provider: "bedrock"; method: "generateObject"; schemaName: "Agent7ResearchCycle" };
      outerIteration: { index: number; max: number };
      innerLoop: { min_confidence: number | "none"; max_iterations_per_task: number };
      system: string;
      user: string;
      userByteLength: number;
    }
  | {
      kind: "finalize_max_outer_iterations";
      updatedAt: string;
      modelCall: { provider: "bedrock"; method: "generateObject"; schemaName: "Agent7Finalize" };
      system: string;
      user: string;
      userByteLength: number;
    };

type WriteInput =
  | (Omit<Extract<ContextBuilderFileContents, { kind: "research_cycle" }>, "userByteLength">)
  | (Omit<Extract<ContextBuilderFileContents, { kind: "finalize_max_outer_iterations" }>, "userByteLength">);

/**
 * Best-effort: never throws; failures are silent so research runs are not blocked.
 */
export async function writeContextBuilderFile(input: WriteInput): Promise<void> {
  try {
    const userByteLength = Buffer.byteLength(input.user, "utf8");
    const payload: ContextBuilderFileContents = { ...input, userByteLength } as ContextBuilderFileContents;
    await writeWorkspaceText(CONTEXT_BUILDER_FILE, JSON.stringify(payload, null, 2) + "\n");
  } catch {
    // ignore: disk/permissions; Agent 7 call must proceed
  }
}
