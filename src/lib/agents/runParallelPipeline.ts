import { classifyIntent } from "@/lib/agents/intentRouter";
import { runPlanner } from "@/lib/agents/planner";
import { runWorkersParallel } from "@/lib/agents/researchWorker";
import { runSynthesizer } from "@/lib/agents/synthesizer";
import {
  runPreferencesAgent,
  applyPreferencePatch,
  extractApplicablePreferences,
} from "@/lib/agents/preferencesAgent";
import {
  CHAT_MEMORY_FILE,
  DOMAIN_MANUAL_FILE,
  USER_OUTPUT_FILE,
  loadWorkspaceDomainManualOrDefault,
  readWorkspaceText,
  writeWorkspaceText,
} from "@/lib/workspaceNode";
import { buildCompactResearchMemoryForAgent7Prompt, mergeResearchTurn, nextResearchTurnKey } from "@/lib/researchSessionMemory";
import { parseChatMemoryFile } from "@/lib/chatMemoryJson";
import { readUserPreferences } from "@/lib/preferenceUtils";
import type {
  Agent7Dimension,
  Agent7KnownGapGroup,
  DomainManualUserPreferences,
  ParallelPipelineResult,
  ParallelPipelineStep,
  SessionPreference,
  SynthesizerOutput,
  WorkerOutput,
  PlannerOutput,
} from "@/lib/types";

export type RunParallelPipelineInput = {
  objective: string;
  subject_scope?: string;
  research_hygiene?: Record<string, unknown>;
  memoryJson?: Record<string, unknown>;
  known_gaps_seed?: Agent7KnownGapGroup[];
  key_findings?: Record<string, unknown>;
  dimensions?: Agent7Dimension[];
  session_preferences?: SessionPreference[];
  max_rounds?: number;
};

async function persistParallelTurn(input: {
  question: string;
  documentMarkdown: string;
  findingsSummary: { key: string; value: unknown };
  workerResults: WorkerOutput[];
  plannerResult: PlannerOutput;
}): Promise<void> {
  const raw = await readWorkspaceText(CHAT_MEMORY_FILE);
  const doc = parseChatMemoryFile(raw);
  const turnKey = nextResearchTurnKey(doc);

  const userOutput: Record<string, unknown> = {
    summary: { key: input.findingsSummary.key, value: input.findingsSummary.value },
    document: input.documentMarkdown,
    planner: {
      objective_understanding: input.plannerResult.objective_understanding,
      execution_strategy: input.plannerResult.execution_strategy,
      task_count: input.plannerResult.tasks.length,
    },
  };

  for (const wr of input.workerResults) {
    userOutput[`worker_${wr.task_id}`] = {
      dimension: wr.dimension,
      factor: wr.factor,
      confidence: wr.confidence,
      summary: wr.summary.slice(0, 800),
      sources_count: wr.sources.length,
      gaps: wr.gaps_remaining,
    };
  }

  const merged = mergeResearchTurn(raw, turnKey, {
    question: input.question,
    "user-output": userOutput as import("@/lib/researchSessionMemory").ResearchUserOutput,
  });
  await writeWorkspaceText(CHAT_MEMORY_FILE, merged);
}

export async function runParallelPipeline(
  input: RunParallelPipelineInput,
): Promise<ParallelPipelineResult> {
  const steps: ParallelPipelineStep[] = [];

  const chatMemoryRaw = await readWorkspaceText(CHAT_MEMORY_FILE);
  const conversationContext = buildCompactResearchMemoryForAgent7Prompt(chatMemoryRaw, {
    maxTurnsInFullDetail: 2,
    minOlderTurnsForSummaryOnly: 1,
  });

  let intent;
  try {
    intent = await classifyIntent(input.objective, conversationContext || undefined);
  } catch {
    intent = { intent: "research" as const, has_preference_signal: false, reasoning: "fallback" };
  }
  steps.push({ kind: "intent", result: intent });

  const domain_manual = await loadWorkspaceDomainManualOrDefault();
  const userPrefs: DomainManualUserPreferences = readUserPreferences(domain_manual);
  const sessionPrefs = input.session_preferences ?? [];
  const userPrefsSummary = extractApplicablePreferences(userPrefs, input.objective, sessionPrefs);

  if (intent.intent === "chat" && !intent.has_preference_signal) {
    return {
      success: true,
      stopped: "chat_reply",
      document_markdown: intent.chat_reply ?? "Hello! What would you like me to research?",
      key_findings: input.key_findings ?? {},
      dimensions: input.dimensions ?? [],
      known_gaps: input.known_gaps_seed ?? [],
      chat_memory_path: CHAT_MEMORY_FILE,
      user_output_path: USER_OUTPUT_FILE,
      rounds_completed: 0,
      steps,
    };
  }

  if (intent.intent === "chat" && intent.has_preference_signal) {
    try {
      const prefResult = await runPreferencesAgent({
        user_message: input.objective,
        conversation_context: conversationContext,
        current_preferences: userPrefs,
        objective_context: "general conversation",
      });
      steps.push({ kind: "preferences", result: prefResult });
      await applyPreferencePatch(prefResult, DOMAIN_MANUAL_FILE);

      const newSessionPrefs = prefResult.session_preference
        ? [...sessionPrefs, prefResult.session_preference]
        : sessionPrefs;

      return {
        success: true,
        stopped: "chat_reply",
        document_markdown: intent.chat_reply ?? "Got it, I'll remember that.",
        key_findings: input.key_findings ?? {},
        dimensions: input.dimensions ?? [],
        known_gaps: input.known_gaps_seed ?? [],
        chat_memory_path: CHAT_MEMORY_FILE,
        user_output_path: USER_OUTPUT_FILE,
        preference_notification: prefResult.notification,
        session_preferences: newSessionPrefs.length > 0 ? newSessionPrefs : undefined,
        rounds_completed: 0,
        steps,
      };
    } catch {
      return {
        success: true,
        stopped: "chat_reply",
        document_markdown: intent.chat_reply ?? "Got it!",
        key_findings: input.key_findings ?? {},
        dimensions: input.dimensions ?? [],
        known_gaps: input.known_gaps_seed ?? [],
        chat_memory_path: CHAT_MEMORY_FILE,
        user_output_path: USER_OUTPUT_FILE,
        rounds_completed: 0,
        steps,
      };
    }
  }

  const plannerResult = await runPlanner({
    objective: input.objective,
    subject_scope: input.subject_scope,
    domain_manual,
    conversation_context: conversationContext,
    user_preferences_summary: userPrefsSummary,
    research_hygiene: input.research_hygiene,
    prior_key_findings: input.key_findings,
    prior_dimensions: input.dimensions,
    prior_known_gaps: input.known_gaps_seed,
  });
  steps.push({ kind: "planner", result: plannerResult });

  const maxRounds = Math.min(input.max_rounds ?? 3, 5);
  let allWorkerResults: WorkerOutput[] = [];
  let synthesized: SynthesizerOutput | undefined;
  let round = 0;
  let tasksForRound = plannerResult.tasks;

  while (true) {
    round++;

    const roundWorkerResults = await runWorkersParallel({
      tasks: tasksForRound,
      domain_manual,
      research_hygiene: input.research_hygiene,
      user_preferences_summary: userPrefsSummary,
      execution_strategy: round === 1 ? plannerResult.execution_strategy : "all_parallel",
      profile_task_id: round === 1 ? plannerResult.profile_task_id : undefined,
    });

    for (const wr of roundWorkerResults) {
      if (round === 1) {
        steps.push({ kind: "worker", task_id: wr.task_id, result: wr });
      } else {
        steps.push({ kind: "dig_deeper_worker", task_id: wr.task_id, round, result: wr });
      }
    }
    allWorkerResults = [...allWorkerResults, ...roundWorkerResults];

    synthesized = await runSynthesizer({
      objective: input.objective,
      subject_scope: input.subject_scope,
      domain_manual,
      worker_results: allWorkerResults,
      user_preferences_summary: userPrefsSummary,
      research_hygiene: input.research_hygiene,
      prior_key_findings: input.key_findings,
      prior_dimensions: input.dimensions,
      prior_known_gaps: input.known_gaps_seed,
      round,
      max_rounds: maxRounds,
    });

    if (round === 1) {
      steps.push({ kind: "synthesizer", result: synthesized });
    } else {
      steps.push({ kind: "dig_deeper_synthesizer", round, result: synthesized });
    }

    if (!synthesized.should_continue || round >= maxRounds || synthesized.dig_deeper.length === 0) {
      break;
    }

    tasksForRound = synthesized.dig_deeper;
  }

  await writeWorkspaceText(USER_OUTPUT_FILE, synthesized!.user_facing_document);
  await persistParallelTurn({
    question: input.objective,
    documentMarkdown: synthesized!.user_facing_document,
    findingsSummary: synthesized!.findings_summary,
    workerResults: allWorkerResults,
    plannerResult,
  });

  let prefNotification: string | undefined;
  let newSessionPrefs = sessionPrefs;

  if (intent.has_preference_signal) {
    try {
      const prefResult = await runPreferencesAgent({
        user_message: input.objective,
        conversation_context: conversationContext,
        current_preferences: userPrefs,
        objective_context: plannerResult.objective_understanding,
      });
      steps.push({ kind: "preferences", result: prefResult });
      prefNotification = prefResult.notification;

      if (prefResult.session_preference) {
        newSessionPrefs = [...sessionPrefs, prefResult.session_preference];
      }

      await applyPreferencePatch(prefResult, DOMAIN_MANUAL_FILE);
    } catch {
      // preference failure should not fail the pipeline
    }
  }

  return {
    success: true,
    stopped: "user_deliver",
    document_markdown: synthesized!.user_facing_document,
    key_findings: synthesized!.key_findings,
    dimensions: synthesized!.dimensions,
    known_gaps: synthesized!.known_gaps,
    chat_memory_path: CHAT_MEMORY_FILE,
    user_output_path: USER_OUTPUT_FILE,
    preference_notification: prefNotification,
    session_preferences: newSessionPrefs.length > 0 ? newSessionPrefs : undefined,
    rounds_completed: round,
    steps,
  };
}
