import { compileAgent36LoopToFlatJson } from "@/lib/agents/compileAgent36Run";
import {
  afterAgent7Round,
  afterFinalize,
  appendAgent36Runs,
  formatChatMemoryJson,
  parseChatMemoryFile,
  toJsonSafe,
} from "@/lib/chatMemoryJson";
import {
  Agent7ResearchCycleError,
  finalizeAgent7OnMaxIterations,
  type Agent7ResearchCycleResult,
  orchestrateAgent7ResearchCycle,
} from "@/lib/agents/agent7ResearchCycle";
import { runAgent36ResearchLoop } from "@/lib/agents/agent36ResearchLoop";
import {
  buildCompactResearchMemoryForAgent7Prompt,
  buildResearchUserOutput,
  mergeResearchTurn,
  nextResearchTurnKey,
} from "@/lib/researchSessionMemory";
import type { Agent7ResearchTask } from "@/lib/types";
import { domainManualForAgent3Task } from "@/lib/domainManualPolicy";
import {
  CHAT_MEMORY_FILE,
  loadWorkspaceDomainManualOrDefault,
  readWorkspaceText,
  SANDBOX_73_MEMORY_FILE,
  writeWorkspaceText,
  USER_OUTPUT_FILE,
} from "@/lib/workspaceNode";

export type Agent73LoopOuterStep = {
  kind: "agent7";
  outer_index: number;
  result: Agent7ResearchCycleResult;
};

export type Agent73LoopResearchStep = {
  kind: "agent36";
  outer_index: number;
  task_id: string;
  research_task: Agent7ResearchTask;
  /** Flattened run (for Agent 7 / traces). */
  compiled: Record<string, unknown>;
  /** Full `Agent36ResearchLoopResponse` JSON (unified run, all inner iterations). */
  full_loop: Record<string, unknown>;
  raw_loop_stopped: string;
  final_confidence: number;
};

export type Agent73LoopFinalizeStep = {
  kind: "finalize";
  reason: "max_outer_iterations" | "deliver" | "ask_user" | "error";
  user_facing_document: string;
};

export type Agent73LoopStep = Agent73LoopOuterStep | Agent73LoopResearchStep | Agent73LoopFinalizeStep;

export type RunAgent73OrchestrationResult =
  | {
      success: true;
      stopped: "user_deliver" | "ask_user" | "max_iterations_forced";
      steps: Agent73LoopStep[];
      /** Final markdown for the user (same as `user-output.md` for this run). */
      document_markdown: string;
      chat_memory_path: string;
      user_output_path: string;
      /** Echo for the next Research chat request. */
      key_findings: Record<string, unknown>;
      dimensions: import("@/lib/types").Agent7Dimension[];
      known_gaps: import("@/lib/types").Agent7KnownGapGroup[];
    }
  | { success: false; error: string; steps?: Agent73LoopStep[] };

export type RunAgent73OrchestrationInput = {
  objective: string;
  /**
   * Optional human text: research subject (company, topic, etc.), what is out of scope, and how
   * much to spend on disambiguation—passed to Agent 7 and finalize as `subject_scope` in the user prompt.
   */
  subject_scope?: string;
  research_hygiene?: Record<string, unknown>;
  memoryJson?: Record<string, unknown>;
  known_gaps_seed?: import("@/lib/types").Agent7KnownGapGroup[];
  key_findings?: Record<string, unknown>;
  dimensions?: import("@/lib/types").Agent7Dimension[];
  max_outer_iterations: number;
  /** 0–1, passed to Agent 3/6 inner loop. */
  min_confidence_3_6?: number;
  max_iterations_3_6: number;
  /**
   * `sandbox` → `workspace/sandbox-73-memory.json` (legacy chrono format).
   * `research` → `workspace/chat-memory.json` (turn blocks with `question` / `user-output`); requires `research_user_question`.
   */
  persistence?: "sandbox" | "research";
  /** User message for this run (Research tab); used as the `question` field in chat-memory. */
  research_user_question?: string;
};

async function persistResearchTurnToDisk(input: {
  question: string;
  documentMarkdown: string;
  steps: Agent73LoopStep[];
  lastFindingsSummary: { key: string; value: unknown } | null;
}): Promise<void> {
  const raw = await readWorkspaceText(CHAT_MEMORY_FILE);
  const doc = parseChatMemoryFile(raw);
  const turnKey = nextResearchTurnKey(doc);
  const userOut = buildResearchUserOutput(
    input.steps.map((s) => {
      if (s.kind === "agent7") return { kind: "agent7" as const, result: s.result };
      if (s.kind === "agent36")
        return {
          kind: "agent36" as const,
          outer_index: s.outer_index,
          full_loop: s.full_loop,
        };
      return {
        kind: "finalize" as const,
        reason: s.reason,
        user_facing_document: s.user_facing_document,
      };
    }),
    input.documentMarkdown,
    input.lastFindingsSummary,
  );
  const merged = mergeResearchTurn(raw, turnKey, {
    question: input.question,
    "user-output": userOut,
  });
  await writeWorkspaceText(CHAT_MEMORY_FILE, merged);
}

/**
 * Agent 7 ↔ (Agent 3/6) until Agent 7 chooses `deliver_to_user`, `ask_user` (clarify), or the outer cap is hit.
 * Sandbox: `sandbox-73-memory.json`. Research: `chat-memory.json` (turn blocks) + `user-output.md`.
 */
export async function runAgent73OrchestrationLoop(
  input: RunAgent73OrchestrationInput,
): Promise<RunAgent73OrchestrationResult> {
  const persistence = input.persistence ?? "sandbox";
  const isResearch = persistence === "research";
  if (isResearch && !input.research_user_question?.trim()) {
    return { success: false, error: "research persistence requires research_user_question." };
  }

  const maxOuter = Math.max(1, Math.min(50, Math.trunc(input.max_outer_iterations)));
  const max36 = Math.max(1, Math.min(20, Math.trunc(input.max_iterations_3_6)));
  const domain_manual = await loadWorkspaceDomainManualOrDefault();

  const memPath = isResearch ? null : SANDBOX_73_MEMORY_FILE;
  const readPathForAgent7 = isResearch ? CHAT_MEMORY_FILE : SANDBOX_73_MEMORY_FILE;

  const steps: Agent73LoopStep[] = [];
  let lastCompiledRuns: unknown[] = [];
  let key_findings: Record<string, unknown> = input.key_findings ?? {};
  let dimensions: import("@/lib/types").Agent7Dimension[] = input.dimensions ?? [];
  let known_gaps: import("@/lib/types").Agent7KnownGapGroup[] = input.known_gaps_seed ?? [];
  let lastA7: Agent7ResearchCycleResult | null = null;
  let memDoc: Record<string, unknown> = {};

  for (let outer = 0; outer < maxOuter; outer++) {
    let chatIn = "";
    try {
      chatIn = await readWorkspaceText(readPathForAgent7);
    } catch (e) {
      const err = e instanceof Error ? e.message : "read memory file failed";
      return { success: false, error: err, steps };
    }
    if (!isResearch) {
      memDoc = parseChatMemoryFile(chatIn);
    }

    const chatInForA7 = isResearch
      ? buildCompactResearchMemoryForAgent7Prompt(chatIn, {
          maxTurnsInFullDetail: 3,
          minOlderTurnsForSummaryOnly: 2,
        })
      : chatIn;

    let a7: Agent7ResearchCycleResult;
    try {
      a7 = await orchestrateAgent7ResearchCycle({
        objective: input.objective,
        subject_scope: input.subject_scope,
        domain_manual,
        research_hygiene: input.research_hygiene,
        memoryJson: input.memoryJson,
        key_findings: Object.keys(key_findings).length ? key_findings : undefined,
        dimensions: dimensions.length ? dimensions : undefined,
        known_gaps_seed: known_gaps.length ? known_gaps : undefined,
        chat_memory_current: chatInForA7.trim() || (isResearch ? "" : JSON.stringify(memDoc, null, 2)),
        last_compiled_runs: lastCompiledRuns,
        outer_iteration: { index: outer + 1, max: maxOuter },
        inner_loop: { min_confidence: input.min_confidence_3_6, max_iterations: max36 },
      });
    } catch (e) {
      const msg = e instanceof Agent7ResearchCycleError ? e.message : (e instanceof Error ? e.message : "Agent 7 failed");
      return { success: false, error: msg, steps };
    }

    lastA7 = a7;
    key_findings = a7.key_findings;
    dimensions = a7.dimensions;
    known_gaps = a7.known_gaps;
    steps.push({ kind: "agent7", outer_index: outer + 1, result: a7 });

    if (!isResearch && memPath) {
      memDoc = afterAgent7Round(memDoc, a7.findings_summary, a7);
      try {
        await writeWorkspaceText(memPath, formatChatMemoryJson(memDoc));
      } catch (e) {
        const err = e instanceof Error ? e.message : "write sandbox memory failed";
        return { success: false, error: err, steps };
      }
    }

    const userFacingOut =
      (a7.orchestration === "deliver_to_user" || a7.orchestration === "ask_user") &&
      a7.user_facing_document?.trim();
    if (userFacingOut) {
      const doc = a7.user_facing_document!.trim();
      const isAsk = a7.orchestration === "ask_user";
      try {
        await writeWorkspaceText(USER_OUTPUT_FILE, doc);
      } catch (e) {
        const err = e instanceof Error ? e.message : "write user-output failed";
        return { success: false, error: err, steps };
      }
      steps.push({ kind: "finalize", reason: isAsk ? "ask_user" : "deliver", user_facing_document: doc });

      if (isResearch) {
        try {
          await persistResearchTurnToDisk({
            question: input.research_user_question!.trim(),
            documentMarkdown: doc,
            steps,
            lastFindingsSummary: a7.findings_summary,
          });
        } catch (e) {
          const err = e instanceof Error ? e.message : "write research chat-memory failed";
          return { success: false, error: err, steps };
        }
      }

      return {
        success: true,
        stopped: isAsk ? "ask_user" : "user_deliver",
        steps,
        document_markdown: doc,
        chat_memory_path: isResearch ? CHAT_MEMORY_FILE : SANDBOX_73_MEMORY_FILE,
        user_output_path: USER_OUTPUT_FILE,
        key_findings: a7.key_findings,
        dimensions: a7.dimensions,
        known_gaps: a7.known_gaps,
      };
    }

    const a36Tasks = a7.assignments.filter((x) => x.assignee === "agent3_agent6" && x.research_task);
    if (a7.orchestration === "delegate_research" && a36Tasks.length === 0) {
      return {
        success: false,
        error: "Agent 7 returned delegate_research but no agent3_agent6 assignment was produced.",
        steps,
      };
    }

    const taskList = a36Tasks
      .map((as) => as.research_task)
      .filter((rt): rt is Agent7ResearchTask => rt !== undefined);

    let loops: Awaited<ReturnType<typeof runAgent36ResearchLoop>>[];
    try {
      loops = await Promise.all(
        taskList.map((rt) =>
          runAgent36ResearchLoop({
            research_task: rt,
            domain_manual: domainManualForAgent3Task(domain_manual, rt),
            research_hygiene: input.research_hygiene,
            min_confidence: input.min_confidence_3_6,
            max_iterations: max36,
          }),
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Agent 3/6 research failed";
      return { success: false, error: msg, steps };
    }

    for (let i = 0; i < taskList.length; i++) {
      const rt = taskList[i]!;
      const loop = loops[i]!;
      const compiled = compileAgent36LoopToFlatJson(loop, { min_confidence_request: input.min_confidence_3_6 });
      lastCompiledRuns = [...lastCompiledRuns, { task_id: rt.task_id, task_goal: rt.goal, run: compiled }];
      steps.push({
        kind: "agent36",
        outer_index: outer + 1,
        task_id: rt.task_id,
        research_task: rt,
        compiled,
        full_loop: toJsonSafe(loop) as unknown as Record<string, unknown>,
        raw_loop_stopped: loop.stopped_reason,
        final_confidence: loop.final_agent3_result.confidence.score,
      });
    }

    if (!isResearch && memPath && taskList.length > 0) {
      memDoc = appendAgent36Runs(
        memDoc,
        taskList.map((_, i) => ({ output: loops[i]! })),
      );
      try {
        await writeWorkspaceText(memPath, formatChatMemoryJson(memDoc));
      } catch (e) {
        const err = e instanceof Error ? e.message : "write sandbox memory failed";
        return { success: false, error: err, steps };
      }
    }
  }

  if (!lastA7) {
    return { success: false, error: "No Agent 7 result (logic error).", steps };
  }

  const finalizeReadPath = isResearch ? CHAT_MEMORY_FILE : SANDBOX_73_MEMORY_FILE;
  let finalDoc: { user_facing_document: string; findings_summary: { key: string; value: unknown } };
  try {
    const chat = await readWorkspaceText(finalizeReadPath);
    memDoc = isResearch ? {} : parseChatMemoryFile(chat);
    const chatForFinalize = isResearch
      ? buildCompactResearchMemoryForAgent7Prompt(chat, { maxTurnsInFullDetail: 3, minOlderTurnsForSummaryOnly: 2 })
      : chat;
    finalDoc = await finalizeAgent7OnMaxIterations({
      objective: input.objective,
      subject_scope: input.subject_scope,
      domain_manual,
      research_hygiene: input.research_hygiene,
      key_findings: lastA7.key_findings,
      known_gaps: lastA7.known_gaps,
      dimensions: lastA7.dimensions,
      chat_memory_current: chatForFinalize.trim() || (isResearch ? "" : JSON.stringify(memDoc, null, 2)),
      compiled_runs: lastCompiledRuns,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Finalization failed";
    return { success: false, error: msg, steps };
  }

  if (!isResearch && memPath) {
    memDoc = afterFinalize(memDoc, finalDoc.findings_summary);
  }

  const doc = finalDoc.user_facing_document.trim();

  steps.push({
    kind: "finalize",
    reason: "max_outer_iterations",
    user_facing_document: doc,
  });

  try {
    await writeWorkspaceText(USER_OUTPUT_FILE, doc);
    if (isResearch) {
      await persistResearchTurnToDisk({
        question: input.research_user_question!.trim(),
        documentMarkdown: doc,
        steps,
        lastFindingsSummary: finalDoc.findings_summary,
      });
    } else {
      await writeWorkspaceText(SANDBOX_73_MEMORY_FILE, formatChatMemoryJson(memDoc));
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : "write output files failed";
    return { success: false, error: err, steps };
  }

  return {
    success: true,
    stopped: "max_iterations_forced",
    steps,
    document_markdown: doc,
    chat_memory_path: isResearch ? CHAT_MEMORY_FILE : SANDBOX_73_MEMORY_FILE,
    user_output_path: USER_OUTPUT_FILE,
    key_findings: lastA7.key_findings,
    dimensions: lastA7.dimensions,
    known_gaps: lastA7.known_gaps,
  };
}
