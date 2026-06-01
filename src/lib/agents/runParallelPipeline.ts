import { classifyIntent } from "@/lib/agents/intentRouter";
import {
  orchestratorPlan,
  orchestratorDeliver,
  type ActiveFindingForOrchestrator,
  type OrchestratorServices,
} from "@/lib/agents/orchestrator";
import {
  runResearchWorker,
  runWithConcurrencyLimit,
  MAX_CONCURRENT_WORKERS,
  STAGGER_MS,
} from "@/lib/agents/researchWorker";
import { runWorkerReview } from "@/lib/agents/workerReview";
import {
  runPreferencesAgent,
  applyPreferencePatch,
  extractApplicablePreferences,
} from "@/lib/agents/preferencesAgent";
import { generateDimensionSummary } from "@/lib/agents/dimensionSummaryAgent";
import { generateConnectionInsights } from "@/lib/agents/connectionAgent";
import { generateLearnedPatterns } from "@/lib/agents/learnedPatternsAgent";
import {
  DOMAIN_MANUAL_FILE,
  USER_OUTPUT_FILE,
  loadWorkspaceDomainManualOrDefault,
  readWorkspaceText,
  writeWorkspaceText,
  getCurrentSessionId,
  getSessionChatHistoryFile,
} from "@/lib/workspaceNode";
import { buildCompactResearchMemoryForAgent7Prompt, nextResearchTurnKey } from "@/lib/researchSessionMemory";
import { parseChatMemoryFile } from "@/lib/chatMemoryJson";
import {
  appendWorkerFinding,
  appendChatHistoryTurn,
  readActiveFindings,
  readDimensionSummaries,
  readConnectionInsights,
  writeConnectionInsights,
  writeDimensionSummary,
  markDimensionInactive,
  readThesisEvolution,
  appendThesisEvolutionEntry,
  readActiveFindingsByDimension,
  readDimensionStatus,
  readLearnedPatterns,
  appendLearnedPatterns,
} from "@/lib/sessionStorage";
import { readUserPreferences } from "@/lib/preferenceUtils";
import type {
  Agent7Dimension,
  DomainManualUserPreferences,
  OrchestratorDeliverOutput,
  ParallelPipelineResult,
  ParallelPipelineStep,
  PipelineConfig,
  PlannerResearchTask,
  SessionPreference,
  ThesisEvolutionEntry,
  WorkerReviewOutput,
} from "@/lib/types";
import { DEFAULT_PIPELINE_CONFIG } from "@/lib/types";
import { enrichWorkerOutputWithAgent4Extract } from "@/lib/agents/agent4Extract";
import {
  mergeParallelSourcePolicy,
  parallelSourcePolicyFromEnv,
  type ParallelSourcePolicy,
  type ParallelSourcePolicyRequest,
} from "@/lib/parallelSourcePolicy";
import type { SessionWorkerFinding } from "@/lib/sessionStorage";

export type RunParallelPipelineInput = {
  objective: string;
  subject_scope?: string;
  session_preferences?: SessionPreference[];
  pipeline_config?: Partial<PipelineConfig>;
  /** Merged with `PARALLEL_SEARCH_*` env for worker Parallel web search */
  source_policy_request?: ParallelSourcePolicyRequest;
};

function resolveConfig(partial?: Partial<PipelineConfig>): PipelineConfig {
  if (!partial) return { ...DEFAULT_PIPELINE_CONFIG };
  return { ...DEFAULT_PIPELINE_CONFIG, ...partial };
}

/** Convert accumulated pipeline steps to the on-disk trace format. */
function buildPipelineTrace(steps: ParallelPipelineStep[]): Record<string, unknown>[] {
  const pipeline_trace: Record<string, unknown>[] = [];
  for (const step of steps) {
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
          round: step.round,
          investment_thesis_draft: step.result.investment_thesis_draft,
          action_type: step.result.action.type,
          thesis_evolution_entry: step.result.thesis_evolution_entry,
          tasks: step.result.action.type === "assign_tasks"
            ? step.result.action.tasks.map((t) => ({
                task_id: t.task_id,
                dimension: t.dimension,
                factor: t.factor,
                goal: t.goal,
                priority: t.priority,
                search_guidance: t.search_guidance,
              }))
            : [],
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
      case "worker_review":
        pipeline_trace.push({
          step: "worker_review",
          round: step.round,
          task_id: step.task_id,
          dimension: step.dimension,
          verdict: step.result.verdict,
          assessment: step.result.assessment,
          has_follow_up: step.result.follow_up_task !== null,
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
  return pipeline_trace;
}

async function persistParallelTurn(input: {
  sessionId: number;
  turnKey: string;
  question: string;
  documentMarkdown: string;
  findingsSummary: { key: string; value: unknown };
  steps: ParallelPipelineStep[];
  roundsCompleted: number;
}): Promise<void> {
  const { sessionId, turnKey } = input;
  const userOutput: Record<string, unknown> = {
    summary: { key: input.findingsSummary.key, value: input.findingsSummary.value },
    document: input.documentMarkdown,
    rounds_completed: input.roundsCompleted,
    pipeline_trace: buildPipelineTrace(input.steps),
  };
  await appendChatHistoryTurn(sessionId, turnKey, {
    question: input.question,
    "user-output": userOutput as import("@/lib/researchSessionMemory").ResearchUserOutput,
  });
}

/** Write a partial turn checkpoint — no document yet, but pipeline reasoning is preserved on disk. */
async function checkpointTurn(
  sessionId: number,
  turnKey: string,
  question: string,
  steps: ParallelPipelineStep[],
): Promise<void> {
  await appendChatHistoryTurn(sessionId, turnKey, {
    question,
    "user-output": {
      summary: "in_progress",
      document: "",
      pipeline_trace: buildPipelineTrace(steps),
    } as import("@/lib/researchSessionMemory").ResearchUserOutput,
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Dimension conclusion logic
// ---------------------------------------------------------------------------

/**
 * After a PLAN round, identify active dimensions that got NO new tasks assigned.
 * Generate compact summaries and mark them inactive.
 * Fire-and-forget — errors are swallowed to avoid blocking the pipeline.
 */
async function concludeCompletedDimensions(
  sessionId: number,
  assignedTasks: PlannerResearchTask[],
  allKnownDimensions: Agent7Dimension[],
): Promise<void> {
  try {
    const assignedDimIds = new Set(assignedTasks.map((t) => t.dimension));
    const activeFindings = await readActiveFindings(sessionId);
    const activeDimIds = new Set(activeFindings.map((f) => f.dimension));

    for (const dim of allKnownDimensions) {
      if (activeDimIds.has(dim.id) && !assignedDimIds.has(dim.id)) {
        // Active dimension got no new tasks → conclude
        const dimFindings = activeFindings.filter((f) => f.dimension === dim.id);
        const summary = await generateDimensionSummary({
          dimensionId: dim.id,
          dimensionLabel: dim.label,
          findings: dimFindings,
        });
        await writeDimensionSummary(sessionId, dim.id, summary);
        await markDimensionInactive(sessionId, dim.id);
      }
    }
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Worker with per-worker review
// ---------------------------------------------------------------------------

async function runWorkerWithReview(input: {
  task: PlannerResearchTask;
  dimension: { id: string; label: string; description?: string };
  sessionId: number;
  turnNumber: number;
  round: number;
  objective: string;
  followUpBudget: number;
  domain_manual: Record<string, unknown>;
  user_preferences_summary: string;
  profile_context?: string;
  search_source_policy: ParallelSourcePolicy | null;
  onStep: (step: ParallelPipelineStep) => void;
}): Promise<void> {
  // Read current dimension findings for context
  const allFindings = await readActiveFindings(input.sessionId);
  const dimensionFindings: SessionWorkerFinding[] = allFindings.filter(
    (f) => f.dimension === input.task.dimension,
  );

  // Run worker
  let workerResult = await runResearchWorker({
    task: input.task,
    domain_manual: input.task.follow_domain_manual !== false ? input.domain_manual : undefined,
    user_preferences_summary: input.user_preferences_summary,
    profile_context: input.profile_context,
    dimension_findings: dimensionFindings.length > 0 ? dimensionFindings : undefined,
    search_source_policy: input.search_source_policy,
  });

  // Enrich with Agent4 extract
  workerResult = await enrichWorkerOutputWithAgent4Extract(workerResult);

  // Write finding
  await appendWorkerFinding(input.sessionId, workerResult, input.turnNumber, input.round);

  // Push worker step
  input.onStep({ kind: "worker", task_id: input.task.task_id, round: input.round, result: workerResult });

  // Read updated dimension findings (includes the one just written)
  const updatedFindings = await readActiveFindings(input.sessionId);
  const updatedDimFindings = updatedFindings.filter((f) => f.dimension === input.task.dimension);

  // Run worker review
  let reviewResult: WorkerReviewOutput;
  try {
    reviewResult = await runWorkerReview({
      objective: input.objective,
      dimension: input.dimension,
      task: input.task,
      worker_output: workerResult,
      dimension_findings: updatedDimFindings,
      follow_up_budget: input.followUpBudget,
    });
  } catch {
    reviewResult = {
      verdict: "sufficient",
      assessment: "Review failed — accepting worker output.",
      follow_up_task: null,
    };
  }

  // Push worker_review step
  input.onStep({
    kind: "worker_review",
    task_id: input.task.task_id,
    round: input.round,
    dimension: input.task.dimension,
    result: reviewResult,
  });

  // If needs_followup and budget > 0: recurse
  if (reviewResult.verdict === "needs_followup" && reviewResult.follow_up_task && input.followUpBudget > 0) {
    await runWorkerWithReview({
      ...input,
      task: reviewResult.follow_up_task,
      followUpBudget: input.followUpBudget - 1,
    });
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function runParallelPipeline(
  input: RunParallelPipelineInput,
): Promise<ParallelPipelineResult> {
  const steps: ParallelPipelineStep[] = [];
  const config = resolveConfig(input.pipeline_config);
  const searchSourcePolicy: ParallelSourcePolicy | null = mergeParallelSourcePolicy(
    parallelSourcePolicyFromEnv(),
    input.source_policy_request ?? undefined,
  );

  // Resolve active session and turn key once at the top — used for all storage writes.
  const sessionId = await getCurrentSessionId();
  const chatHistoryFile = getSessionChatHistoryFile(sessionId);
  const chatMemoryRaw = await readWorkspaceText(chatHistoryFile);
  const chatMemoryDoc = parseChatMemoryFile(chatMemoryRaw);
  const currentTurnKey = nextResearchTurnKey(chatMemoryDoc);
  const turnNumber = parseInt(currentTurnKey, 10);

  const conversationContext = buildCompactResearchMemoryForAgent7Prompt(chatMemoryRaw, {
    maxTurnsInFullDetail: 2,
    minOlderTurnsForSummaryOnly: 1,
  });

  // Extract last 10 user messages from chat history for PLAN context
  const chatHistory: string[] = [];
  const turnKeys = Object.keys(chatMemoryDoc).sort((a, b) => parseInt(a) - parseInt(b));
  for (const key of turnKeys.slice(-10)) {
    const turn = chatMemoryDoc[key] as { question?: string } | undefined;
    if (turn?.question) chatHistory.push(turn.question);
  }

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
    const reply = intent.chat_reply ?? "Hello! What would you like me to research?";
    await appendChatHistoryTurn(sessionId, currentTurnKey, {
      question: input.objective,
      "user-output": { summary: "chat_reply", document: reply, intent: "chat" } as import("@/lib/researchSessionMemory").ResearchUserOutput,
    }).catch(() => {});
    return {
      success: true,
      stopped: "chat_reply",
      document_markdown: reply,
      key_findings: {},
      dimensions: [],
      known_gaps: [],
      chat_memory_path: chatHistoryFile,
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

      const reply = intent.chat_reply ?? "Got it, I'll remember that.";
      await appendChatHistoryTurn(sessionId, currentTurnKey, {
        question: input.objective,
        "user-output": { summary: "chat_reply", document: reply, intent: "chat", preference: prefResult.notification } as import("@/lib/researchSessionMemory").ResearchUserOutput,
      }).catch(() => {});
      return {
        success: true,
        stopped: "chat_reply",
        document_markdown: reply,
        key_findings: {},
        dimensions: [],
        known_gaps: [],
        chat_memory_path: chatHistoryFile,
        user_output_path: USER_OUTPUT_FILE,
        preference_notification: prefResult.notification,
        session_preferences: newSessionPrefs.length > 0 ? newSessionPrefs : undefined,
        rounds_completed: 0,
        steps,
      };
    } catch {
      const reply = intent.chat_reply ?? "Got it!";
      await appendChatHistoryTurn(sessionId, currentTurnKey, {
        question: input.objective,
        "user-output": { summary: "chat_reply", document: reply, intent: "chat" } as import("@/lib/researchSessionMemory").ResearchUserOutput,
      }).catch(() => {});
      return {
        success: true,
        stopped: "chat_reply",
        document_markdown: reply,
        key_findings: {},
        dimensions: [],
        known_gaps: [],
        chat_memory_path: chatHistoryFile,
        user_output_path: USER_OUTPUT_FILE,
        rounds_completed: 0,
        steps,
      };
    }
  }

  // --- Research pipeline: Orchestrator PLAN → Workers+Reviews → loop → Deliver ---

  const learnedPatterns = await readLearnedPatterns();

  let round = 0;
  const maxRounds = Math.min(config.max_rounds, 5);

  while (round < maxRounds) {
    round++;

    // Read current state from disk
    const [thesisEvolution, dimensionStatus, inactiveSummaries, activeDimFiles] = await Promise.all([
      readThesisEvolution(sessionId),
      readDimensionStatus(sessionId),
      readDimensionSummaries(sessionId),
      readActiveFindingsByDimension(sessionId),
    ]);

    const services: OrchestratorServices = {
      domain_manual: Object.keys(domain_manual).length > 0 ? domain_manual : undefined,
      learned_patterns: learnedPatterns.trim() || undefined,
    };

    // Call PLAN
    let planResult;
    try {
      planResult = await orchestratorPlan({
        objective: input.objective,
        subject_scope: input.subject_scope,
        services,
        user_preferences_summary: userPrefsSummary,
        thesis_evolution: thesisEvolution,
        chat_history: chatHistory,
        dimension_status: dimensionStatus,
        inactive_dimension_summaries: inactiveSummaries,
        active_dimension_files: activeDimFiles,
        round,
        config,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: `[orchestrator_plan round ${round}] ${msg}`, steps };
    }

    steps.push({ kind: "orchestrator_plan", round, result: planResult });

    // Append thesis evolution entry (inject turn + round)
    const entryWithMeta: ThesisEvolutionEntry = {
      ...planResult.thesis_evolution_entry,
      turn: turnNumber,
      round,
    };
    void appendThesisEvolutionEntry(sessionId, entryWithMeta).catch(() => {});

    void checkpointTurn(sessionId, currentTurnKey, input.objective, steps);

    // Check action
    if (planResult.action.type === "deliver") {
      break; // exit loop, proceed to deliver
    }

    // Assign tasks → run workers with reviews
    const { tasks, execution_strategy, profile_task_id } = planResult.action;
    const tasksForRound = tasks.slice(0, config.max_tasks_per_round);

    if (tasksForRound.length === 0) break;

    // Get dimensions from the thesis evolution entry for context
    const knownDimensions = planResult.thesis_evolution_entry.dimensions;

    // Build dimension lookup for worker reviews
    const dimensionLookup = new Map(knownDimensions.map((d) => [d.id, d]));

    // Wrap a single worker+review with try/catch so one failure doesn't sink the round.
    const runOne = (task: PlannerResearchTask, profile_context?: string) => async () => {
      const dim = dimensionLookup.get(task.dimension) ?? { id: task.dimension, label: task.dimension };
      try {
        await runWorkerWithReview({
          task,
          dimension: dim,
          sessionId,
          turnNumber,
          round,
          objective: input.objective,
          followUpBudget: 2,
          domain_manual,
          user_preferences_summary: userPrefsSummary,
          profile_context,
          search_source_policy: searchSourcePolicy,
          onStep: (s) => steps.push(s),
        });
      } catch (e) {
        // Per-worker failure (rate limit, parse error, etc.) — log into the trace and continue.
        const msg = e instanceof Error ? e.message : String(e);
        steps.push({
          kind: "worker_review",
          task_id: task.task_id,
          round,
          dimension: task.dimension,
          result: {
            verdict: "sufficient",
            assessment: `Worker failed: ${msg.slice(0, 200)}`,
            follow_up_task: null,
          },
        });
      }
    };

    // Handle two_phase: run profile task first (sequentially), then rest with concurrency limit
    if (execution_strategy === "two_phase" && profile_task_id) {
      const profileTask = tasksForRound.find((t) => t.task_id === profile_task_id);
      if (profileTask) {
        await runOne(profileTask)();
      }

      // Read profile context from the finding just written
      const profileFindings = await readActiveFindings(sessionId);
      const profileFinding = profileFindings.find((f) => f.task_id === profile_task_id);
      const profileContext = profileFinding
        ? `Company/subject profile from initial research:\n${profileFinding.summary}`
        : undefined;

      // Run remaining tasks with concurrency limit + stagger
      const remaining = tasksForRound.filter((t) => t.task_id !== profile_task_id);
      const fns = remaining.map((task) => runOne(task, profileContext));
      await runWithConcurrencyLimit(fns, MAX_CONCURRENT_WORKERS, STAGGER_MS);
    } else {
      // all_parallel — still concurrency-limited to avoid Bedrock throttling
      const fns = tasksForRound.map((task) => runOne(task));
      await runWithConcurrencyLimit(fns, MAX_CONCURRENT_WORKERS, STAGGER_MS);
    }

    // Auto-conclude dimensions that got no new tasks
    void concludeCompletedDimensions(sessionId, tasksForRound, knownDimensions);

    // Refresh connection insights (fire-and-forget)
    void (async () => {
      try {
        const [freshActive, freshInactive] = await Promise.all([
          readActiveFindings(sessionId),
          readDimensionSummaries(sessionId),
        ]);
        const insights = await generateConnectionInsights({
          objective: input.objective,
          activeFindings: freshActive,
          inactiveSummaries: freshInactive,
        });
        if (insights) await writeConnectionInsights(sessionId, insights);
      } catch { /* non-fatal */ }
    })();

    void checkpointTurn(sessionId, currentTurnKey, input.objective, steps);
  }

  // Read final state for deliver
  const [finalThesisEvolution, finalActiveFindings, finalInactiveSummaries, finalConnectionInsights] = await Promise.all([
    readThesisEvolution(sessionId),
    readActiveFindings(sessionId),
    readDimensionSummaries(sessionId),
    readConnectionInsights(sessionId),
  ]);

  const finalActiveFindingsForOrch: ActiveFindingForOrchestrator[] = finalActiveFindings.map((f) => ({
    dimension: f.dimension,
    factor: f.factor,
    task_id: f.task_id,
    round: f.round,
    confidence: f.confidence,
    summary: f.summary,
    gaps_remaining: f.gaps_remaining,
    rabbithole_leads: f.rabbithole_leads,
  }));

  let delivered: OrchestratorDeliverOutput;
  try {
    delivered = await orchestratorDeliver({
      objective: input.objective,
      subject_scope: input.subject_scope,
      user_preferences_summary: userPrefsSummary,
      thesis_evolution: finalThesisEvolution,
      active_findings: finalActiveFindingsForOrch,
      inactive_summaries: finalInactiveSummaries,
      connection_insights: finalConnectionInsights,
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
    sessionId,
    turnKey: currentTurnKey,
    question: input.objective,
    documentMarkdown: delivered.user_facing_document,
    findingsSummary: delivered.findings_summary,
    steps,
    roundsCompleted: round,
  });

  // Fire-and-forget: extract generalizable patterns and append to global learned-patterns.md
  void (async () => {
    try {
      const lastEntry = finalThesisEvolution.rounds[finalThesisEvolution.rounds.length - 1];
      const finalNotes = lastEntry?.notes ?? "";
      const finalKeyFindings = lastEntry?.key_findings ?? {};
      const connections = lastEntry?.connections ?? [];
      const contradictions = lastEntry?.contradictions ?? [];

      const patterns = await generateLearnedPatterns({
        objective: input.objective,
        subject: input.objective,
        investment_thesis: delivered.investment_thesis,
        dimensions: delivered.dimensions,
        key_findings: finalKeyFindings,
        connections,
        contradictions,
        final_notes: finalNotes,
      });
      if (patterns.trim()) {
        const today = new Date().toISOString().slice(0, 10);
        const entry = `## ${today} — ${input.objective.slice(0, 80)}\n\n${patterns}\n\n---`;
        await appendLearnedPatterns(entry);
      }
    } catch {
      // non-fatal
    }
  })();

  // --- Preferences (async, non-blocking) ---
  let prefNotification: string | undefined;
  let newSessionPrefs = sessionPrefs;

  if (intent.has_preference_signal) {
    try {
      const prefResult = await runPreferencesAgent({
        user_message: input.objective,
        conversation_context: conversationContext,
        current_preferences: userPrefs,
        objective_context: input.objective,
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
    chat_memory_path: chatHistoryFile,
    user_output_path: USER_OUTPUT_FILE,
    preference_notification: prefNotification,
    session_preferences: newSessionPrefs.length > 0 ? newSessionPrefs : undefined,
    rounds_completed: round,
    steps,
  };
}
