/**
 * Plain-text spec snippets for Phase 2 sandbox (Agent 7 → Agent 3 plan → Agent 6 → Agent 3 review).
 * Source of truth: specs/design-phase2.md
 */

export const AGENT3_PLAN_PHASE2_CHEATSHEET = `Agent 3 — Phase 2 PLAN (after Agent 7)

Input
- Flow: Agent 7 provides research_task via assignments. Agent 3 is first here—no web search, only planning. POST /api/agent3-research-plan and the A3–A6 loop may merge the latest review’s suggested_queries / task_gaps into a follow-up plan so the next search direction matches the review.
- research_task (required) — Same JSON as assignments[].research_task from Agent 7: task_id, dimension, factor, goal, context, method_instructions, variables_to_find, calculation_logic, search_guidance, validation_criteria, adaptation_signals, fallback_methods, success_criteria, priority, expected_output_format.
- domain_manual (optional) — JSON: same as orchestrator; conditions planning language.
- research_hygiene (optional) — JSON: same as orchestrator; may inform extraction_notes.
- prior_rounds (optional) — Array of { agent3_plan, agent6_result, agent3_review }; enables re-planning. Newest last. Latest review’s suggested_queries and task_gaps are highlighted to the model and merged at the API/loop when present.
- iteration_hint (optional) — Free text (e.g. “Planning round 2 of 3”) for logging in the user message.

Output
- Shape — The plan API returns flat top-level fields (search_objective, search_queries, …) that map to nested Agent3ResearchPlan.agent6_assignment.
- plan_summary — Short internal rationale: why this pass is structured this way and what Agent 6 should achieve.
- search_objective — Single natural-language objective for Parallel beta.search (what to find or verify this round).
- search_queries — Array of 1–14 non-empty, distinct, concrete search strings (not one comma-joined string).
- extraction_notes (optional) — Hints for the extraction step: map snippets to variables_to_find, norms, or hygiene.
- open_questions (optional) — String array of open uncertainties to track; omit or [].`;

export const AGENT6_PHASE2_SPEC_CHEATSHEET = `Agent 6 — Phase 2 EXECUTE (after Agent 3 plan)

Input
- Flow: This is the only step that calls Parallel beta.search in the Phase-2 research-task path; the extraction LLM then maps hits to research_task.
- research_task (required) — Full task JSON for extraction (variable names, goal, method_instructions, etc.).
- agent3_assignment (strongly recommended) — Object with search_objective, search_queries (1–14), optional extraction_notes. You may paste the inner agent6_assignment only, or a full plan JSON; the server unwraps agent6_assignment when needed. When set, beta.search uses this assignment (plus optional merge from prior review in re-plans), not only task.search_guidance / variables_to_find.
- domain_manual, research_hygiene (optional) — Passed into the extraction user message.
- iteration_extension (optional) — { additional_queries?, objective_suffix? } appends to queries/objective; cleared in sandbox on “→ Agent 6 (follow-up)” so a new assignment is not mixed with an old extension.

Output
- queries_used — String array: exact queries sent to beta.search (post-merge, deduped, capped).
- source_urls — Distinct normalized URLs from search hits.
- extracted_key_data — Array of { variable, status: found|partial|not_found, value_summary, supporting_snippet?, source_url? }; source_url must match a returned hit URL when present.
- parallel_search_id — Optional id from the search provider.`;

export const AGENT3_REVIEW_PHASE2_CHEATSHEET = `Agent 3 — Phase 2 REVIEW (after Agent 6)

Input
- Flow: After Agent 6; no new web search here. Output feeds Agent 7 and may trigger another plan → execute → review (needs_further_search, suggested_queries). Sandbox: import review JSON, apply locally, or “→ Agent 6 (follow-up)”. POST /api/agent3-6-research-loop runs plan → Agent 6 → review each iteration until sufficient or cap.
- research_task (required) — Same task that was used for the Agent 6 run.
- agent6_result (required) — Full Agent6ResearchRunResult: queries_used, source_urls, extracted_key_data, parallel_search_id?.
- domain_manual, research_hygiene (optional) — JSON context for judgment and phrasing.
- iteration_hint (optional) — e.g. “Review after round 1 of 3.”

Output
- sources_and_data — Array of { url, relevance, data_noted } listing sources and what was found.
- analysis_points — Bullet-level synthesis or comparison points.
- summary — Task-level answer narrative for the orchestrator.
- task_gaps — What remains missing, ambiguous, or weakly supported.
- assumptions — Array of { name, type: data_backed|benchmark_based|speculative, justification?, source?, risk_level }.
- confidence — { score, breakdown: { data_quality, source_agreement, assumption_strength, method_fit, coverage_completeness }, reasoning }.
- needs_further_search (optional) — If true, another plan → Agent 6 → review may help.
- suggested_queries (optional) — Concrete next search strings for follow-up; drive re-plan and sandbox “→ Agent 6 (follow-up)” when present.`;

/** @deprecated Split cheatsheets are authoritative for UI. */
export const AGENT36_SPEC_CHEATSHEET = `${AGENT3_PLAN_PHASE2_CHEATSHEET}

---

${AGENT6_PHASE2_SPEC_CHEATSHEET}

---

${AGENT3_REVIEW_PHASE2_CHEATSHEET}`;
