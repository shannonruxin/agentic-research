export const INTENT_ROUTER_CHEATSHEET = `Intent Router — classify user message

Input
- message (required) — The user's raw message text.
- conversation_context (optional) — Compact summary of prior conversation turns.

Output (IntentClassification)
- intent: "chat" | "research" — Whether this needs web research or is a simple chat message.
- has_preference_signal: boolean — Whether the message contains a preference about HOW research should be done (can coexist with either intent).
- reasoning: string — Brief explanation of classification.
- chat_reply: string (when intent="chat") — Direct reply to the user, no research triggered.

Heuristic path: regex patterns for greetings, meta-questions, research signals, preference signals. If heuristic is confident, returns instantly (<100ms, no LLM call).
LLM fallback: generateObject with intentClassificationSchema when heuristic is ambiguous.`;

export const ORCHESTRATOR_CHEATSHEET = `Orchestrator (Chief Research Analyst) — single-brain investment analyst

The orchestrator is a senior investment analyst conducting due diligence. It operates in 2 phases:

PLAN Phase (each round)
Input:
- objective (required) — User's research request.
- subject_scope (optional) — In-scope subject, out-of-scope rules, disambiguation.
- user_preferences_summary — Auto-extracted from domain manual.
- thesis_evolution — JSON array of prior PLAN rounds (ThesisEvolutionFile).
- chat_history — Last N user messages.
- dimension_status — Active/inactive per dimension ID.
- inactive_dimension_summaries — Compact summaries of concluded dimensions.
- active_dimension_files — Live findings grouped by dimension ID.

Output (OrchestratorPlanOutput):
- investment_thesis_draft — Current hypothesis.
- thesis_evolution_entry — Full analytical snapshot: dimensions, known_gaps, key_findings, notes, connections, contradictions.
- action: { type: "assign_tasks", tasks, execution_strategy, profile_task_id? } | { type: "deliver" }
  - assign_tasks: design 3-8 PlannerResearchTask objects (task_id, dimension, factor, goal, search_guidance, priority).
  - execution_strategy: "all_parallel" | "two_phase" (two_phase: profile first, then rest).
  - deliver: when sufficient research has been gathered.

DELIVER Phase (final synthesis)
Input: objective, thesis_evolution, active_findings, inactive_summaries, connection_insights, rounds_completed.
Output (OrchestratorDeliverOutput):
- user_facing_document — Full Markdown investment research report.
- key_findings, dimensions, known_gaps — Structured outputs.
- findings_summary — { key, value } for persistence.
- investment_thesis — Concise 2–4 sentence thesis statement.`;

export const WORKER_CHEATSHEET = `Research Worker — execute one research task with web search

Input
- task (required) — PlannerResearchTask JSON (task_id, dimension, factor, goal, search_guidance, priority).
- domain_manual (optional) — When task.follow_domain_manual is not false.
- user_preferences_summary — Applicable preferences.
- profile_context (optional) — Company profile from phase-1 worker (two_phase strategy).

Execution
- Uses generateText with webSearch tool (Parallel API beta.search).
- Worker decides when to search again vs when it has enough (max 5 tool-use steps).
- Adapts search queries based on what it finds.

Output (WorkerOutput)
- task_id, dimension, factor — Echo from input task.
- summary — 200–500 word comprehensive findings.
- sources — [{ url, title?, relevance, data_noted }].
- extracted_data — [{ entity, type?, what_it_does[], status: found|partial|not_found, source_url? }].
- confidence — 0.0–1.0.
- gaps_remaining — What could not be found.
- search_queries_used — All queries executed.
- rabbithole_leads — 0–5 high-signal threads worth deeper investigation (specific leads, not restated gaps).`;

export const FULL_PIPELINE_CHEATSHEET = `Full Pipeline — end-to-end orchestrator-driven research

Flow
1. Intent Router → classify chat vs research
2. If chat → fast reply (no pipeline)
3. Orchestrator PLAN (round N) → decide action: assign_tasks or deliver
4. If assign_tasks → Workers run tasks in parallel (with per-worker review)
   - Each worker runs web search, writes findings to session dimension file
   - Worker Review fires immediately after each worker: sufficient or needs_followup
   - If needs_followup: one targeted follow-up task runs (budget: 2 per worker)
5. Auto-conclude dimensions that received no new tasks in the round
6. Refresh cross-dimension connection insights (fire-and-forget)
7. Back to step 3 (next round) — up to max_rounds
8. If action=deliver (or max_rounds reached) → Orchestrator DELIVER → final investment report
9. Persist to session/sessionN/chat-history.json + session/sessionN/{dimension}.json + user-output.md
10. Preferences Agent (async, if preference signal detected)

Thesis evolution is tracked as JSON (ThesisEvolutionFile) — one entry per PLAN round.
Each entry: investment_thesis, dimensions, known_gaps, key_findings, notes, connections, contradictions.

Configurable via pipeline_config:
- max_rounds (default 5, max 5) — Maximum orchestrator plan rounds.
- max_workers_concurrent (default 2) — Parallel worker limit.
- worker_stagger_ms (default 2000) — Delay between worker launches.
- max_worker_steps (default 5) — Max tool-use steps per worker.
- max_tasks_per_round (default 8) — Max tasks per round.
- orchestrator_temperature (default 0.2) — LLM temperature for orchestrator.
- worker_temperature (default 0.2) — LLM temperature for workers.
- deliver_max_tokens (default 16000) — Max output tokens for deliver phase.

Output (ParallelPipelineResult)
- document_markdown — Final user-facing report.
- key_findings, dimensions, known_gaps — Structured outputs.
- rounds_completed — How many rounds ran.
- preference_notification — If a preference was learned.
- session_preferences — Active session preferences.
- steps — Full trace: intent, orchestrator_plan, worker(s), worker_review(s), orchestrator_deliver, preferences.`;
