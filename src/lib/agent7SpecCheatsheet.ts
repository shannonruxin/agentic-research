/**
 * Plain-text spec summary for Agent 7 sandbox (review alongside model output).
 * Source of truth: specs/design-phase2.md — update when design changes.
 */
export const AGENT7_SPEC_CHEATSHEET = `Agent 7 — field definitions (sandbox reference)

dimension vs factor
- dimension: high-level bucket (e.g. market_size, competition, technology).
- factor: specific investigation under that dimension (e.g. TAM estimation).

known_gaps (output)
- Gaps BEFORE a responsible answer — including on the FIRST turn: missing scope info (company, industry, geography), missing numbers (TAM/SAM), unstated assumptions, or “cannot answer yet because…”.
- Grouped by dimension when applicable; use dimension omitted or “Objective / scope” for pre-dimension questions (e.g. “Which company? What revenue model?”).

key_findings
- Structured JSON object Agent 7 owns and refines across iterations.

confidence (current API shape)
- level: low | medium | high
- rationale: optional short explanation
(Target Phase 2: score, dimension_breakdown, key_risks — see design-phase2.md.)

Shared components (for downstream Agent 3 tasks — design)
- data_quality, source_agreement, assumption_strength, method_fit, coverage_completeness

assumption_strength
- Two axes: how much is assumed (amount + criticality) vs how well justified (quality).

assignments (output)
- Who should act next: agent3_agent6 (research task), agent4_agent5 (verbatim/crop brief), agent8 (memory update directive).
- Each research task follows A7→A3 schema: task_id, dimension, factor, goal, context, method_instructions, variables_to_find, calculation_logic, search_guidance, validation_criteria, adaptation_signals, fallback_methods, success_criteria, priority, expected_output_format.

train_of_thought
- Orchestrator reasoning: how objective + domain_manual + memory + prior seeds map to dimensions, gaps, and assignments.`;
