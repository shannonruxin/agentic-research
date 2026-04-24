import type { Agent7ResearchTask } from "@/lib/types";

/**
 * Whether Agent 3/6 should inject `workspace/domain-manuals/domain-manual.json` for this task.
 * Agent 7 sets `follow_domain_manual: false` when the task is unrelated to that manual; omitted
 * means follow (same as true).
 */
export function agent3UsesWorkspaceDomainManual(task: Agent7ResearchTask): boolean {
  return task.follow_domain_manual !== false;
}

/**
 * Subset of the workspace manual to pass into Agent 3/6 prompts. Returns `undefined` when the
 * task opts out so downstream code keeps domain lines out of the user message.
 */
export function domainManualForAgent3Task(
  workspaceManual: Record<string, unknown>,
  task: Agent7ResearchTask,
): Record<string, unknown> | undefined {
  if (!agent3UsesWorkspaceDomainManual(task)) return undefined;
  return workspaceManual;
}
