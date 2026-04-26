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

export const PLANNER_CHEATSHEET = `Planner — decompose objective into parallel tasks

Input
- objective (required) — User's research request.
- subject_scope (optional) — In-scope subject, out-of-scope rules, disambiguation.
- domain_manual — Loaded from workspace/domain-manuals/domain-manual.json (includes user_preferences).
- conversation_context — Summary of prior turns (auto-built from chat-memory.json).
- user_preferences_summary — Extracted applicable preferences.
- research_hygiene (optional) — Citation rules, sourcing norms.
- prior_key_findings, prior_dimensions, prior_known_gaps (optional) — From earlier conversation turns.

Output (PlannerOutput)
- objective_understanding — Restatement of what success looks like.
- dimensions — 1–16 thematic lenses (e.g. market_size, technology, competitors).
- known_gaps — Grouped missing info.
- tasks — 2–12 PlannerResearchTask objects, each with:
  - task_id, dimension, factor, goal, search_guidance (2–10 queries), variables_to_find, extraction_focus, priority, follow_domain_manual
- execution_strategy: "all_parallel" | "two_phase"
  - two_phase: profile_task_id runs first, its results are shared with remaining tasks.
- reasoning — How inputs map to task decomposition.`;

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

export const SYNTHESIZER_CHEATSHEET = `Synthesizer — merge worker results into unified report

Input
- objective, subject_scope, domain_manual, user_preferences_summary, research_hygiene — Same as planner.
- worker_results — Array of WorkerOutput from all workers (across all rounds).
- prior_key_findings, prior_dimensions, prior_known_gaps (optional).
- round — Current round number (1-indexed).
- max_rounds — Maximum allowed rounds.

Output (SynthesizerOutput)
- user_facing_document — Complete Markdown report (executive summary, sections, sources).
- key_findings — Structured JSON findings by dimension.
- dimensions — Final set of research dimensions.
- known_gaps — What remains unknown.
- findings_summary — Rolling summary { key, value } for persistence.
- coverage_assessment — Per-dimension score (0.0–1.0) with reasoning:
  - Below 0.5 = significant gaps. Below 0.3 = critical gaps.
  - Considers: variables_to_find coverage, source diversity, confidence.
- dig_deeper — Follow-up PlannerResearchTask objects for under-covered dimensions (max 6).
  - Refined search_guidance based on what was already tried.
  - Considers workers' rabbithole_leads for high-signal threads.
- should_continue — true when dig_deeper has tasks AND coverage is insufficient.
  - Forced false on final round.`;

export const FULL_PIPELINE_CHEATSHEET = `Full Parallel Pipeline — end-to-end research

Flow
1. Intent Router → classify chat vs research
2. If chat → fast reply (no pipeline)
3. Planner → decompose into parallel tasks
4. Workers (parallel) → execute tasks with web search
5. Synthesizer → merge results, assess coverage
6. If should_continue → dig_deeper tasks back to Workers (round 2+)
7. Max 3 rounds (configurable up to 5)
8. Persist to chat-memory.json + user-output.md
9. Preferences Agent (async, if preference signal detected)

Input
- objective (required) — User's research request.
- subject_scope (optional) — Disambiguation and scope constraints.
- research_hygiene (optional) — Citation/sourcing norms.
- max_rounds (optional, default 3, max 5) — Maximum synthesis rounds.

Output (ParallelPipelineResult)
- document_markdown — Final user-facing report.
- key_findings, dimensions, known_gaps — Structured outputs.
- rounds_completed — How many synthesis rounds ran.
- preference_notification — If a preference was learned.
- session_preferences — Active session preferences.
- steps — Full trace: intent, planner, worker(s), synthesizer, dig_deeper_worker(s), dig_deeper_synthesizer, preferences.`;
