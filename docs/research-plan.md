# Research Pipeline — Full IO Reference

This document is the authoritative reference for all orchestrator phases, the sub-agents that support them, and the memory architecture that connects them.

---

## Overview

The pipeline is an **orchestrator-driven multi-agent research loop**. One orchestrator brain directs parallel research workers, each immediately reviewed on completion, then synthesises all findings into an investment-grade report.

```
User message
    │
    ▼
Intent Router              ← classifies: research vs chat
    │
    ▼
Orchestrator PLAN          ← reads all state from disk, decides: assign tasks or deliver
    │
    ├── action: assign_tasks
    │       │
    │       ▼
    │   Workers (parallel)  ← each runs one task with web search
    │       │  (each worker fires Worker Review immediately on completion)
    │       ▼
    │   Worker Review (parallel, one per worker)
    │       ├── needs_followup → new Worker fires immediately for that dimension
    │       └── sufficient → dimension candidate for conclusion
    │       │
    │       ▼
    │   connectionAgent (fire-and-forget) → connections.md
    │       │
    │       └──→ back to PLAN (reads updated state, decides next round or deliver)
    │
    └── action: deliver
            │
            ▼
        Deliver function   ← synthesises all findings into final report
            │
            ▼
        learnedPatternsAgent (fire-and-forget) → learned-patterns.md
        Preferences Agent  ← learns/updates user preferences (if signal detected)
```

### Key design decisions

- **PLAN is the single brain** — reads all state from disk each round, decides whether to assign more tasks or deliver. No separate REVIEW or DELIVER phases.
- **Worker Review is per-worker, not batch** — fires immediately when a worker completes, reviews only that dimension. Maximum parallelism.
- **Dimension auto-conclusion** — when PLAN assigns zero new tasks to an active dimension, it's automatically concluded: summarised by `dimensionSummaryAgent`, marked inactive. PLAN's silence = dimension done.
- **No confidence scores** — Worker Review gives a binary qualitative verdict (`sufficient`/`needs_followup`). Only signal that matters is PLAN judging the full argument is complete.

---

## Memory Architecture

### Session-scoped storage (`workspace/session/session{N}/`)

| Path | Contents |
|------|----------|
| `chat-memory.json` | Full turn history (questions + pipeline traces + in_progress checkpoints) |
| `{dimension-id}.json` | Array of `SessionWorkerFinding` for that dimension; `active: true` while live |
| `orchestrator-state/thesis-evolution.json` | JSON file — round-by-round snapshots of thesis, dimensions, key findings, notes |
| `orchestrator-state/connections.md` | Cross-dimension patterns from connectionAgent — overwritten after each PLAN round |
| `orchestrator-state/dimension-summaries/{dim}.md` | Compact LLM summary of a concluded dimension |

### Global storage (`workspace/global/`)

Global files are shared across all sessions and persist indefinitely.

| Path | Contents |
|------|----------|
| `domain-manuals/domain-manual.json` | Research domain rules + user preferences (all tiers) |
| `orchestrator-state/orchestrator-system-prompt.md` | Orchestrator persona and analytical framework — applies to PLAN and deliver |
| `orchestrator-state/learned-patterns.md` | Append-only log of generalizable analytical patterns from past sessions |

### Active vs Inactive dimensions

- **Active**: `active: true` on all findings. Full dimension file shown to PLAN.
- **Inactive (concluded)**: `active: false` on all findings. Compact summary stored in `dimension-summaries/`. PLAN sees only the summary — not raw findings.
- **Conclusion trigger**: After each PLAN round assigns tasks, any active dimension that received **zero new tasks** is automatically concluded. `dimensionSummaryAgent` generates the summary; findings marked inactive.

### Thesis evolution file (JSON)

`thesis-evolution.json` is the orchestrator's full train-of-thought history. Each PLAN call appends one round entry:

```json
{
  "rounds": [
    {
      "turn": 1,
      "round": 1,
      "investment_thesis": "string",
      "dimensions": [{ "id": "slug", "label": "string", "description": "string" }],
      "known_gaps": [{ "dimension": "string", "gaps": ["string"] }],
      "key_findings": { "dimension-id": "finding summary" },
      "notes": "free-form orchestrator reasoning, observations, hypotheses",
      "connections": ["string"],
      "contradictions": ["string"]
    }
  ]
}
```

PLAN reads the full `rounds` array each call to understand how the thesis and evidence has evolved before deciding its next action.

---

## Orchestrator PLAN

**Purpose**: Single orchestrator brain. Reads all state from disk, updates the thesis evolution, then takes one action: assign more research tasks or deliver.

**Called**: Once per round — after all workers+reviews for the previous round have completed.

### Input

**Goal-based:**

| Field | Type | Description |
|-------|------|-------------|
| `objective` | `string` | User's research request |
| `subject_scope` | `string?` | In-scope subject definition and disambiguation rules |
| `user_preferences_summary` | `string` | Auto-extracted applicable preferences |

**State-based (read from disk before each call):**

| Field | Type | Description |
|-------|------|-------------|
| `thesis_evolution` | `ThesisEvolutionFile` | Full round-by-round history JSON — the orchestrator's analytical thread |
| `chat_history` | `string[]` | Last 10 user messages (questions only, not responses) |
| `dimension_status` | `Record<string, "active" \| "inactive">` | Which dimensions are active (full file) vs inactive (summary only) |
| `inactive_dimension_summaries` | `{ dimensionId, summary }[]` | Compact summaries of concluded dimensions |
| `active_dimension_files` | `Record<string, SessionWorkerFinding[]>` | Full findings for every active dimension, grouped by dimension ID |

**Services (injected into prompt):**

| Service key | Description |
|-------------|-------------|
| `domain_manual` | Research domain rules and process guidelines |
| `learned_patterns` | Generalizable patterns from prior research sessions |

### Output: `OrchestratorPlanOutput`

| Field | Type | Description |
|-------|------|-------------|
| `investment_thesis_draft` | `string` | Current hypothesis — updated each round |
| `thesis_evolution_entry` | `ThesisEvolutionEntry` | New round entry to append to the JSON file (dimensions, known_gaps, key_findings, notes, connections, contradictions) |
| `action` | `PlanAction` | What to do next |

#### `PlanAction`

```typescript
type PlanAction =
  | {
      type: "assign_tasks";
      tasks: PlannerResearchTask[];
      execution_strategy: "all_parallel" | "two_phase";
      profile_task_id?: string;   // two_phase only
    }
  | { type: "deliver" }
```

### Disk writes after PLAN

| File | Operation | Description |
|------|-----------|-------------|
| `orchestrator-state/thesis-evolution.json` | Append round entry | New entry injected with `turn` + `round` from pipeline |
| `chat-memory.json` | Checkpoint write | `in_progress` stub — preserves pipeline state if server crashes |

---

## Research Workers

**Purpose**: Execute one research task with iterative web search.

### Input

| Field | Description |
|-------|-------------|
| `task` | `PlannerResearchTask` — the assigned task |
| `dimension_findings` | All prior active findings for this dimension — context so the worker doesn't re-search what's already known |
| `domain_manual` | Domain rules |
| `user_preferences_summary` | Applicable preferences |
| `profile_context` | Company profile from phase-1 worker (two_phase strategy only) |

**Execution**: `generateText` with a `webSearch` tool (Parallel API `beta.search`), max 5 tool-use steps.

### `PlannerResearchTask` fields

| Field | Description |
|-------|-------------|
| `task_id` | Unique identifier |
| `dimension` | Dimension ID this task belongs to |
| `factor` | Sub-factor being investigated |
| `goal` | What the worker should find out |
| `search_guidance` | Concrete starting search queries |
| `priority` | `high` \| `medium` \| `low` |

### Output: `WorkerOutput`

| Field | Description |
|-------|-------------|
| `task_id` | Echoed from input |
| `dimension` | Echoed from input |
| `factor` | From LLM output — may refine the planned factor based on what was found |
| `summary` | 200–500 word comprehensive findings |
| `sources` | `[{ url, title?, relevance, data_noted }]` |
| `extracted_data` | Structured extraction rows |
| `confidence` | 0.0–1.0 self-assessed (used internally, not graded by review) |
| `gaps_remaining` | What could not be found |
| `search_queries_used` | All queries executed |
| `rabbithole_leads` | 0–5 high-signal threads |

**Live storage**: Each worker's output is immediately written to `session{N}/{dimension}.json` via `appendWorkerFinding()` — before Worker Review runs.

---

## Worker Review

**Purpose**: Per-worker, per-dimension quality check. Decides whether the task goal was answered or a follow-up is needed.

**Trigger**: Fires immediately when a worker completes — does not wait for other workers.

**Parallelism**: Multiple Worker Reviews run concurrently.

**Scope**: Only sees one dimension. No global context, no thesis evolution, no other dimensions.

### Input

| Field | Description |
|-------|-------------|
| `objective` | High-level research goal — grounds the assessment |
| `dimension` | ID + label + description of the dimension being reviewed |
| `task` | The task the worker just completed |
| `worker_output` | What the worker found: `summary`, `sources`, `gaps_remaining`, `rabbithole_leads` |
| `dimension_findings` | Full dimension file — all active findings for this dimension (so reviewer knows what's already covered) |
| `follow_up_budget` | Remaining follow-up allowance — pipeline enforces ceiling of 2 per dimension chain |

### Output: `WorkerReviewOutput`

| Field | Description |
|-------|-------------|
| `verdict` | `sufficient` \| `needs_followup` |
| `assessment` | Qualitative — what was found, what's missing, whether the gap is material |
| `follow_up_task` | Single `PlannerResearchTask` if `needs_followup`; `null` if `sufficient` |

**No confidence scores.** Binary verdict only, backed by qualitative reasoning.

**On `needs_followup`**: new worker fires immediately for that dimension with the follow-up task. Follow-up worker receives the full dimension file for context — continues from where the last worker left off.

**On `sufficient`**: dimension is a candidate for conclusion (PLAN makes the final call next round based on whether it assigns new tasks).

**Budget exhausted**: if `follow_up_budget <= 0`, verdict is forced `sufficient`.

---

## Deliver

**Purpose**: Synthesise all evidence into the final investment research document.

**Trigger**: PLAN outputs `action: { type: "deliver" }`.

### Input

| Field | Type | Description |
|-------|------|-------------|
| `objective` | `string` | Research objective |
| `subject_scope` | `string?` | Scope constraints |
| `user_preferences_summary` | `string` | Applicable preferences |
| `thesis_evolution` | `ThesisEvolutionFile` | Full round-by-round analytical history |
| `active_findings` | `ActiveFindingForOrchestrator[]` | Final active dimension findings |
| `inactive_summaries` | `{ dimensionId, summary }[]` | All concluded dimension summaries |
| `connection_insights` | `string` | Final connections.md content |
| `rounds_completed` | `number` | How many research rounds ran |

### Output: `OrchestratorDeliverOutput`

| Field | Description |
|-------|-------------|
| `user_facing_document` | Full Markdown investment research report |
| `key_findings` | `{ dimension_id: "summary" }` — structured findings for persistence |
| `dimensions` | Final dimension list |
| `known_gaps` | Final known gaps |
| `findings_summary` | `{ key, value }` — structured summary for chat history persistence |
| `investment_thesis` | Concise 2–4 sentence thesis statement |

### Disk writes after deliver

| File | Operation | Description |
|------|-----------|-------------|
| `workspace/user-output.md` | Overwrite | Convenience copy of the final report |
| `session{N}/chat-memory.json` | Final write | Replaces `in_progress` checkpoint with full turn record |
| `global/orchestrator-state/learned-patterns.md` | Append (fire-and-forget) | 2–5 generalizable patterns from `learnedPatternsAgent` |

---

## dimensionSummaryAgent

**Purpose**: Generate a compact but comprehensive markdown summary of a concluded dimension.

**Trigger**: Automatic (fire-and-forget) — after each PLAN round assigns tasks, any active dimension that received zero new tasks is concluded.

### Input

| Field | Description |
|-------|-------------|
| `dimensionId` | Stable slug ID |
| `dimensionLabel` | Human-readable label |
| `findings` | All active `SessionWorkerFinding[]` for this dimension |

**Output**: Markdown string stored at `orchestrator-state/dimension-summaries/{dim}.md`.

**Effect**: Summary written → all findings for that dimension marked `active: false`.

---

## connectionAgent

**Purpose**: Surface cross-dimension connections, patterns, and contradictions.

**Trigger**: Fire-and-forget after each PLAN round's workers+reviews complete.

### Input

| Field | Description |
|-------|-------------|
| `objective` | Research objective |
| `activeFindings` | All current active `SessionWorkerFinding[]` |
| `inactiveSummaries` | All concluded dimension summaries |

**Output**: Markdown bullet points under: Convergent Evidence, Contradictions, Causal Links, Emerging Themes.

**Effect**: Written to `orchestrator-state/connections.md`. Injected into the next PLAN call via `active_dimension_files` rendering (connections are visible in the prompt context).

**Guard**: Skipped when fewer than 2 distinct dimensions exist.

---

## Preferences Agent

**Purpose**: Learn and persist user preferences about how research should be conducted.

**Trigger**: When the intent classifier detects a `has_preference_signal` in the user message.

**Input**: user message, conversation context, current preferences, objective context.

**Output**: `PreferencesAgentOutput` — may add to global preferences, conditional preferences, pending promotions, or session-only preferences.

**Effect**: Updates `workspace/global/domain-manuals/domain-manual.json`.

---

## Pipeline Configuration

Controlled via `pipeline_config` in the API body or `PipelineConfig` type:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_rounds` | 5 | Maximum PLAN rounds before forced deliver |
| `max_workers_concurrent` | 2 | Parallel worker limit per round |
| `worker_stagger_ms` | 2000 | Delay between worker launches (ms) |
| `max_worker_steps` | 5 | Max tool-use steps per worker |
| `max_tasks_per_round` | 8 | Max tasks PLAN can assign per round |
| `orchestrator_temperature` | 0.2 | LLM temperature for PLAN and deliver |
| `worker_temperature` | 0.2 | LLM temperature for workers |
| `deliver_max_tokens` | 16000 | Max output tokens for deliver phase |

Worker Review has a hard-coded `follow_up_budget` of 2 per dimension chain — each worker can trigger at most 2 follow-up workers before the chain is forced sufficient.

---

## Turn Persistence

Each turn is written to `session{N}/chat-memory.json` as a `{ question, user-output }` block.

**Progressive checkpoints** are written after:
1. Each Orchestrator PLAN call completes
2. Each worker+review round completes

This means pipeline state is preserved even if the deliver phase crashes.

The final `persistParallelTurn` call writes the full turn including the `user_facing_document` and a complete `pipeline_trace`.

---

## Session Management

- `workspace/session-pointer.json` — tracks the active session ID (`{ "session_id": N }`)
- **Lazy session increment**: "New chat" only sets a flag; the session is bumped to `N+1` on the first actual send via `/api/new-session`
- Each session is self-contained: its `chat-memory.json` and dimension JSON files are independent
- `/api/clear-all-sessions` — deletes `workspace/session/` entirely, resets pointer to 0
- `/api/sessions` — lists all sessions with title (first question), turn count, last modified
- `/api/sessions/[id]` — switches pointer and reconstructs the message history for sidebar loading
