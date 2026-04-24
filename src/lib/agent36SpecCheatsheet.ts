/**
 * Plain-text spec snippets for Phase 2 sandbox (Agent 7 → unified Agent 3 ↔ Agent 6 loop).
 */

export const AGENT3_PHASE2_UNIFIED_CHEATSHEET = `Agent 3 — Phase 2 UNIFIED (after Agent 7 / Agent 6)

Input
- Flow: Agent 7 provides research_task via assignments. First hop: Agent 3 plans only (no web search). After Agent 6, Agent 3 reviews and emits the next assignment in one response. POST /api/agent3-phase2 accepts optional agent6_result; POST /api/agent3-6-research-loop runs plan → Agent 6 → unified review/plan each iteration until sufficient or cap.
- research_task (required) — Same JSON as assignments[].research_task from Agent 7.
- domain_manual, research_hygiene (optional) — Orchestrator JSON context.
- agent6_result (optional) — Latest Agent6ResearchRunResult; required after the first iteration; absent on the first planning pass.
- research_log (optional) — Per-iteration memory (newest last): iteration, queries, a6_raw_findings, scan, analysis, progress, decision, insight. Agent 3 treats this as primary memory.
- iteration_hint (optional) — e.g. “Planning round 2 of 3”.

Output (flat plan fields map to Agent3ResearchPlan.agent6_assignment)
- plan_summary, search_objective, search_queries (1–14 distinct), extraction_notes?, open_questions?
- sources_and_data, analysis_points, summary, task_gaps, assumptions, confidence (score, breakdown, reasoning[])
- progress_metrics — iterations_so_far, new_info_count, overlap_rate, cumulative_overlap_rate, source_novelty, trend
- entity_tracking — total_entities, new_entities, repeated_entities, high_relevance_entities, high_rabbithole_entities
- scan — { observations[], emerging_patterns[] } (review pass; pairs with top-level sources_and_data for research_log.scan)
- insight — string (research_log.insight)
- decision — { needs_further_search, reason, suggested_direction?, suggested_queries? } (research_log.decision; top-level needs_further_search / suggested_queries stay in sync)
- needs_further_search?, suggested_queries? (duplicate convenience fields aligned with decision when present)
- Primary signal: agent6_result.extracted_key_data (structured entities); use research_log for stagnation, pivots, and non-redundant queries.`;

export const AGENT3_PLAN_PHASE2_CHEATSHEET = `Agent 3 — Phase 2 PLAN (subset of unified Agent 3)

Use POST /api/agent3-research-plan (plan JSON only) or POST /api/agent3-phase2 without agent6_result.
See AGENT3_PHASE2_UNIFIED for full input/output and research_log behavior.`;

export const AGENT6_PHASE2_SPEC_CHEATSHEET = `Agent 6 — Phase 2 EXECUTE (after Agent 3 plan)

Input
- Flow: Only step that calls Parallel beta.search in the Phase-2 research-task path; extraction LLM maps hits to research_task.
- research_task (required).
- agent3_assignment (strongly recommended) — search_objective, search_queries (1–14), optional extraction_notes. Paste inner agent6_assignment or full plan / unified Agent 3 JSON with those top-level fields; server unwraps agent6_assignment when needed.
- domain_manual, research_hygiene (optional) — Passed into extraction user message.
- iteration_extension (optional) — { additional_queries?, objective_suffix? } appends then should be cleared on follow-up.

Output
- queries_used, source_urls, parallel_search_id?
- extracted_key_data — Per entity: entity, type?, what_it_does[], how_it_works?, target_users?, use_cases?, differentiation_signals?, key_features?, evidence_snippets?, signals?: { novelty|specificity|clarity?: high|medium|low }, status: found|partial|not_found, source_url. Atomic strings only; no single-sentence compression; source_url must match a hit URL when set.`;

export const AGENT3_REVIEW_PHASE2_CHEATSHEET = `Agent 3 — Phase 2 REVIEW (subset of unified Agent 3)

Use POST /api/agent3-research-task with agent6_result (+ optional research_log) or POST /api/agent3-phase2 with agent6_result.
Returns full Agent3Phase2Response (plan fields for the next Agent 6 pass plus synthesis). See AGENT3_PHASE2_UNIFIED.`;

/** @deprecated Prefer AGENT3_PHASE2_UNIFIED_CHEATSHEET */
export const AGENT36_SPEC_CHEATSHEET = `${AGENT3_PHASE2_UNIFIED_CHEATSHEET}

---

${AGENT6_PHASE2_SPEC_CHEATSHEET}`;
