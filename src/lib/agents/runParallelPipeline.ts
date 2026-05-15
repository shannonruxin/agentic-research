import { classifyIntent } from "@/lib/agents/intentRouter";
import {
  orchestratorPlan,
  orchestratorReview,
  orchestratorDeliver,
} from "@/lib/agents/orchestrator";
import { writeChatMemoryJsonAndRebuildDimensions } from "@/lib/dimensionMemoryMarkdown";
import { runWorkersParallel } from "@/lib/agents/researchWorker";
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
  OrchestratorDeliverOutput,
  OrchestratorPlanOutput,
  OrchestratorReviewOutput,
  ParallelPipelineResult,
  ParallelPipelineStep,
  PipelineConfig,
  SessionPreference,
  WorkerOutput,
} from "@/lib/types";
import { DEFAULT_PIPELINE_CONFIG } from "@/lib/types";
import {
  mergeParallelSourcePolicy,
  parallelSourcePolicyFromEnv,
  type ParallelSourcePolicy,
  type ParallelSourcePolicyRequest,
} from "@/lib/parallelSourcePolicy";

export type RunParallelPipelineInput = {
  objective: string;
  subject_scope?: string;
  research_hygiene?: Record<string, unknown>;
  memoryJson?: Record<string, unknown>;
  known_gaps_seed?: Agent7KnownGapGroup[];
  key_findings?: Record<string, unknown>;
  dimensions?: Agent7Dimension[];
  session_preferences?: SessionPreference[];
  pipeline_config?: Partial<PipelineConfig>;
  /** Merged with `PARALLEL_SEARCH_*` env for worker Parallel web search */
  source_policy_request?: ParallelSourcePolicyRequest;
};

function resolveConfig(partial?: Partial<PipelineConfig>): PipelineConfig {
  if (!partial) return { ...DEFAULT_PIPELINE_CONFIG };
  return { ...DEFAULT_PIPELINE_CONFIG, ...partial };
}

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
      case "orchestrator_plan":
        pipeline_trace.push({
          step: "orchestrator_plan",
          objective_understanding: step.result.objective_understanding,
          investment_thesis_draft: step.result.investment_thesis_draft,
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
          working_notes: step.result.working_notes,
        });
        break;
      case "worker":
        pipeline_trace.push({
          step: "worker",
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
      case "orchestrator_review":
        pipeline_trace.push({
          step: "orchestrator_review",
          round: step.round,
          working_notes: step.result.working_notes,
          key_findings: step.result.key_findings,
          coverage_assessment: step.result.coverage_assessment,
          contradictions: step.result.contradictions,
          connections: step.result.connections,
          decision_action: step.result.decision.action,
          dig_deeper_tasks: step.result.decision.action === "dig_deeper"
            ? step.result.decision.tasks.map((t) => ({
                task_id: t.task_id,
                dimension: t.dimension,
                factor: t.factor,
                goal: t.goal,
              }))
            : undefined,
          dimensions: step.result.dimensions,
          known_gaps: step.result.known_gaps,
        });
        break;
      case "orchestrator_deliver":
        pipeline_trace.push({
          step: "orchestrator_deliver",
          investment_thesis: step.result.investment_thesis,
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
  await writeChatMemoryJsonAndRebuildDimensions(merged, turnKey);
}

export async function runParallelPipeline(
  input: RunParallelPipelineInput,
): Promise<ParallelPipelineResult> {
  const steps: ParallelPipelineStep[] = [];
  const config = resolveConfig(input.pipeline_config);
  const searchSourcePolicy: ParallelSourcePolicy | null = mergeParallelSourcePolicy(
    parallelSourcePolicyFromEnv(),
    input.source_policy_request ?? undefined,
  );

  const chatMemoryRaw = await readWorkspaceText(CHAT_MEMORY_FILE);
  const conversationContext = buildCompactResearchMemoryForAgent7Prompt(chatMemoryRaw, {
    maxTurnsInFullDetail: 2,
    minOlderTurnsForSummaryOnly: 1,
  });

  // --- Intent classification ---
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

  // --- Chat fast paths ---
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

  // --- Research pipeline: Orchestrator → Workers → Review loop → Deliver ---

  let planResult: OrchestratorPlanOutput;
  try {
    planResult = await orchestratorPlan({
      objective: input.objective,
      subject_scope: input.subject_scope,
      domain_manual,
      conversation_context: conversationContext,
      user_preferences_summary: userPrefsSummary,
      research_hygiene: input.research_hygiene,
      prior_key_findings: input.key_findings,
      prior_dimensions: input.dimensions,
      prior_known_gaps: input.known_gaps_seed,
      config,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `[orchestrator_plan] ${msg}`, steps };
  }
  steps.push({ kind: "orchestrator_plan", result: planResult });

  const maxRounds = Math.min(config.max_rounds, 5);
  let allWorkerResults: WorkerOutput[] = [];
  let lastReview: OrchestratorReviewOutput | undefined;
  let round = 0;
  let tasksForRound = planResult.tasks.slice(0, config.max_tasks_per_round);

  while (true) {
    round++;

    let roundWorkerResults: WorkerOutput[];
    try {
      roundWorkerResults = await runWorkersParallel({
        tasks: tasksForRound,
        domain_manual,
        research_hygiene: input.research_hygiene,
        user_preferences_summary: userPrefsSummary,
        execution_strategy: round === 1 ? planResult.execution_strategy : "all_parallel",
        profile_task_id: round === 1 ? planResult.profile_task_id : undefined,
        max_concurrent: config.max_workers_concurrent,
        stagger_ms: config.worker_stagger_ms,
        search_source_policy: searchSourcePolicy,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: `[workers round ${round}] ${msg}`, steps };
    }

    for (const wr of roundWorkerResults) {
      steps.push({ kind: "worker", task_id: wr.task_id, round, result: wr });
    }
    allWorkerResults = [...allWorkerResults, ...roundWorkerResults];

    let review: OrchestratorReviewOutput;
    try {
      review = await orchestratorReview({
        objective: input.objective,
        subject_scope: input.subject_scope,
        user_preferences_summary: userPrefsSummary,
        plan: planResult,
        all_worker_results: allWorkerResults,
        round,
        max_rounds: maxRounds,
        prior_review: lastReview,
        config,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: `[orchestrator_review round ${round}] ${msg}`, steps };
    }
    steps.push({ kind: "orchestrator_review", round, result: review });
    lastReview = review;

    if (review.decision.action === "deliver" || round >= maxRounds) {
      break;
    }

    tasksForRound = review.decision.tasks.slice(0, config.max_tasks_per_round);
    if (tasksForRound.length === 0) break;
  }

  let delivered: OrchestratorDeliverOutput;
  try {
    delivered = await orchestratorDeliver({
      objective: input.objective,
      subject_scope: input.subject_scope,
      user_preferences_summary: userPrefsSummary,
      plan: planResult,
      all_worker_results: allWorkerResults,
      final_review: lastReview!,
      rounds_completed: round,
      config,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `[orchestrator_deliver] ${msg}`, steps };
  }
  steps.push({ kind: "orchestrator_deliver", result: delivered });

  await writeWorkspaceText(USER_OUTPUT_FILE, delivered.user_facing_document);
  await persistParallelTurn({
    question: input.objective,
    documentMarkdown: delivered.user_facing_document,
    findingsSummary: delivered.findings_summary,
    steps,
    roundsCompleted: round,
  });

  // --- Preferences (async, non-blocking) ---
  let prefNotification: string | undefined;
  let newSessionPrefs = sessionPrefs;

  if (intent.has_preference_signal) {
    try {
      const prefResult = await runPreferencesAgent({
        user_message: input.objective,
        conversation_context: conversationContext,
        current_preferences: userPrefs,
        objective_context: planResult.objective_understanding,
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
    document_markdown: delivered.user_facing_document,
    key_findings: delivered.key_findings,
    dimensions: delivered.dimensions,
    known_gaps: delivered.known_gaps,
    chat_memory_path: CHAT_MEMORY_FILE,
    user_output_path: USER_OUTPUT_FILE,
    preference_notification: prefNotification,
    session_preferences: newSessionPrefs.length > 0 ? newSessionPrefs : undefined,
    rounds_completed: round,
    steps,
  };
}
