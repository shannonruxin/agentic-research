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

The orchestrator is a senior investment analyst conducting due diligence. It operates in 3 phases:

PLAN Phase (Round 1)
Input:
- objective (required) — User's research request.
- subject_scope (optional) — In-scope subject, out-of-scope rules, disambiguation.
- conversation_context (optional) — Summary of prior turns.
- user_preferences_summary — Auto-extracted from domain manual.
- research_hygiene (optional) — Citation rules.
- prior_key_findings, prior_dimensions, prior_known_gaps (optional) — From earlier turns.

Output (OrchestratorPlanOutput):
- objective_understanding — Restatement of the investment question.
- investment_thesis_draft — Initial hypothesis to test (even if speculative).
- dimensions — 1–16 thematic lenses (business model, competitive landscape, technology, etc.).
- known_gaps — Grouped missing info.
- tasks — 2–12 PlannerResearchTask objects (task_id, dimension, factor, goal, search_guidance, variables_to_find, priority).
- execution_strategy: "all_parallel" | "two_phase" (two_phase: profile first, then rest).
- working_notes — Private scratchpad for hypotheses and reasoning.

REVIEW Phase (Round 2+, after workers return)
Input: objective, plan, all_worker_results, round, max_rounds, prior_review (optional).
Output (OrchestratorReviewOutput):
- working_notes — Evolving thesis, contradictions, connections.
- key_findings — Structured findings by dimension.
- coverage_assessment — Per-dimension score (0.0–1.0) with reasoning.
- contradictions — Cross-source/dimension contradictions found.
- connections — Cross-dimension connections that strengthen/weaken thesis.
- decision: { action: "dig_deeper", tasks: [...] } | { action: "deliver" }
  - dig_deeper tasks REFERENCE specific findings (e.g., "revenue dropped 20%, investigate if correlated with CTO departure").
  - Never repeats failed queries; cross-references, verifies claims, follows rabbithole leads.
  - Forced to "deliver" on final round.

DELIVER Phase (final synthesis)
Input: objective, plan, all_worker_results, final_review, rounds_completed.
Output (OrchestratorDeliverOutput):
- user_facing_document — Full Markdown research report (executive summary, evidence-grounded analysis, sources, caveats, conclusions).
- key_findings, dimensions, known_gaps — Structured outputs.
- findings_summary — { key, value } for persistence.
- investment_thesis — Concise 2–4 sentence thesis statement.`;

export const WORKER_CHEATSHEET = `Research Worker — execute one research task with web search

Input
- task (required) — PlannerResearchTask JSON (task_id, dimension, factor, goal, search_guidance, etc.).
- domain_manual (optional) — When task.follow_domain_manual is not false.
- research_hygiene (optional) — Citation/sourcing norms.
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
3. Orchestrator Plan → decompose into parallel tasks with investment thesis draft
4. Workers (parallel, max 2 concurrent with 2s stagger) → execute tasks with web search
5. Orchestrator Review → analyze evidence, find contradictions/connections, decide: dig_deeper or deliver
6. If dig_deeper → targeted investigative tasks referencing specific findings → back to Workers (round 2+)
7. Orchestrator Deliver → final investment research document with thesis
8. Persist to chat-dimension-memory/*.md + chat-memory.json + user-output.md
9. Preferences Agent (async, if preference signal detected)

Configurable via pipeline_config:
- max_rounds (default 5, max 5) — Maximum orchestrator review rounds.
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
- steps — Full trace: intent, orchestrator_plan, worker(s), orchestrator_review, orchestrator_deliver, preferences.`;
