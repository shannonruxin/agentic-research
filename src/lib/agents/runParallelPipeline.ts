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
  steps: ParallelPipelineStep[];
  roundsCompleted: number;
}): Promise<void> {
  const raw = await readWorkspaceText(CHAT_MEMORY_FILE);
  const doc = parseChatMemoryFile(raw);
  const turnKey = nextResearchTurnKey(doc);

  const pipeline_trace: Record<string, unknown>[] = [];
  for (const step of input.steps) {
    switch (step.kind) {
      case "intent":
        pipeline_trace.push({
          step: "intent_router",
          intent: step.result.intent,
          has_preference_signal: step.result.has_preference_signal,
          reasoning: step.result.reasoning,
          chat_reply: step.result.chat_reply,
        });
        break;
      case "planner":
        pipeline_trace.push({
          step: "planner",
          objective_understanding: step.result.objective_understanding,
          execution_strategy: step.result.execution_strategy,
          profile_task_id: step.result.profile_task_id,
          dimensions: step.result.dimensions,
          known_gaps: step.result.known_gaps,
          tasks: step.result.tasks.map((t) => ({
            task_id: t.task_id,
            dimension: t.dimension,
            factor: t.factor,
            goal: t.goal,
            priority: t.priority,
            search_guidance: t.search_guidance,
            variables_to_find: t.variables_to_find,
          })),
          reasoning: step.result.reasoning,
        });
        break;
      case "worker":
        pipeline_trace.push({
          step: "worker",
          round: 1,
          task_id: step.task_id,
          dimension: step.result.dimension,
          factor: step.result.factor,
          confidence: step.result.confidence,
          summary: step.result.summary,
          sources: step.result.sources,
          extracted_data: step.result.extracted_data,
          gaps_remaining: step.result.gaps_remaining,
          search_queries_used: step.result.search_queries_used,
          rabbithole_leads: step.result.rabbithole_leads,
        });
        break;
      case "synthesizer":
        pipeline_trace.push({
          step: "synthesizer",
          round: 1,
          should_continue: step.result.should_continue,
          coverage_assessment: step.result.coverage_assessment,
          dig_deeper_count: step.result.dig_deeper.length,
          dig_deeper: step.result.dig_deeper.map((t) => ({
            task_id: t.task_id,
            dimension: t.dimension,
            factor: t.factor,
            goal: t.goal,
          })),
          key_findings: step.result.key_findings,
          dimensions: step.result.dimensions,
          known_gaps: step.result.known_gaps,
          findings_summary: step.result.findings_summary,
        });
        break;
      case "dig_deeper_worker":
        pipeline_trace.push({
          step: "dig_deeper_worker",
          round: step.round,
          task_id: step.task_id,
          dimension: step.result.dimension,
          factor: step.result.factor,
          confidence: step.result.confidence,
          summary: step.result.summary,
          sources: step.result.sources,
          extracted_data: step.result.extracted_data,
          gaps_remaining: step.result.gaps_remaining,
          search_queries_used: step.result.search_queries_used,
          rabbithole_leads: step.result.rabbithole_leads,
        });
        break;
      case "dig_deeper_synthesizer":
        pipeline_trace.push({
          step: "dig_deeper_synthesizer",
          round: step.round,
          should_continue: step.result.should_continue,
          coverage_assessment: step.result.coverage_assessment,
          dig_deeper_count: step.result.dig_deeper.length,
          key_findings: step.result.key_findings,
          dimensions: step.result.dimensions,
          known_gaps: step.result.known_gaps,
          findings_summary: step.result.findings_summary,
        });
        break;
      case "preferences":
        pipeline_trace.push({
          step: "preferences",
          scope: step.result.scope,
          notification: step.result.notification,
          session_preference: step.result.session_preference,
        });
        break;
    }
  }

  const userOutput: Record<string, unknown> = {
    summary: { key: input.findingsSummary.key, value: input.findingsSummary.value },
    document: input.documentMarkdown,
    rounds_completed: input.roundsCompleted,
    pipeline_trace,
  };

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
    steps,
    roundsCompleted: round,
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
