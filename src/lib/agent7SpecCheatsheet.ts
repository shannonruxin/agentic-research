/**
 * Plain-text spec summary for Agent 7 sandbox (review alongside model output).
 * Source of truth: specs/design-phase2.md — update when design changes.
 */
export const AGENT7_SPEC_CHEATSHEET = `Agent 7 — orchestration (field reference)

Input
- objective (required) — What the user wants answered or decided; the main request text.
- domain context — Read by the server from workspace/domain-manuals/domain-manual.json (not sent in the API body). A guide: prefer it when the topic fits; do not treat as mandatory when the case is unrelated.
- research_hygiene (optional) — JSON: citation, sourcing, or process norms (e.g. prefer primary sources, date windows).
- memory (optional) — JSON: durable prior facts or decisions from the session; empty on first turn.
- known_gaps_seed (optional) — Array of { dimension?, gaps[] }. Prior missing-info groups to refine; do not drop unresolved items unless they are now addressed.
- key_findings (optional) — JSON object: prior structured findings from earlier turns; merge and extend, do not erase without cause.
- dimensions (optional) — Array of { id, label, description? }. Each **id** is a stable slug (e.g. competitive-dynamics) used for files and matching; **label** is the human title. Refine, replace, or add as needed. Must be 1–16 when provided (API validation).

Output
- objective_understanding — One coherent restatement of what success looks like in scope.
- dimensions — 1–16 entries: { id, label, description? }; **id** must match **research_task.dimension** for tasks under that lens.
- key_findings — Structured JSON the orchestrator owns and refines across iterations (open shape; not limited to a fixed schema in API).
- known_gaps — Array of { dimension?, gaps[] }; missing evidence or scope before a responsible answer (include first-turn scope gaps, e.g. which company, geography).
- confidence — { level: low|medium|high, rationale? }; overall call quality on the current state of knowledge.
- train_of_thought — Orchestrator reasoning: how inputs map to dimensions, gaps, and assignments.
- assignments — 1–16 handoffs: { assignee, summary?, research_task?, verbatim_brief?, memory_directive? }.
  - assignee: agent3_agent6 (delegate web research), agent4_agent5 (verbatim extract + crop), or agent8 (memory update).
  - When assignee is agent3_agent6, research_task is required — same schema as below.

research_task (inside assignments, when assignee is agent3_agent6)
- task_id — Stable id for this task in the run.
- dimension — Must equal one **dimensions[].id** value from this output (not free-form prose).
- goal — What this task must establish or find.
- context (optional) — Free-form JSON for scope keys (e.g. company, product, time range).
- method_instructions (optional) — Numbered or listed methodological hints for Agent 3/6.
- variables_to_find (optional) — Named quantities or facts the extraction should map to.
- calculation_logic (optional) — How to compute or compare numbers when applicable.
- search_guidance (optional) — Query angles or source types; used for legacy Agent 6 if no agent3_assignment.
- validation_criteria (optional) — What would falsify or confirm a good answer.
- adaptation_signals, fallback_methods, success_criteria, expected_output_format (optional) — Escalation and output-shaping hints.
- priority — high | medium | low.
- follow_domain_manual (optional boolean) — true or omit: Agent 3/6 load the workspace domain manual. false: skip it for this task (unrelated topic).`;
