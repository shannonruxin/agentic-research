# Verbatim agent reference (numbered)

This file mirrors **how agents are defined in code** (`src/lib/types.ts`, Zod in `src/lib/agents/*`). Naming differs from product marketing: the **dual-column pipeline** and **Phase 2 research** both use “Agent 3” and “Agent 6” for different behaviors.

**Legend — optional** means the field can be omitted; **required** must be present for validation.

---

## Agent 1 — query decomposition

**Role:** Turn a free-form user string into a structured investigable query.

**API:** `POST /api/decompose`  
**Body (required):** `{ "query": string }`  
**Output type:** `QueryDecomposition`

**`QueryDecomposition` (required fields)**

| Field | Type | Notes |
|--------|------|--------|
| `core_query` | `string` | Single normalized, investigable query |
| `keywords` | `string[]` | Non-empty strings |
| `support_angles` | `SupportAngle[]` | 2+ angles in successful decomposition (pipeline/research may require 2–6) |

**`SupportAngle`**

| Field | Type |
|--------|------|
| `id` | `string` (e.g. `angle_1`) |
| `label` | `string` |
| `description` | `string` |

**Implementation:** `src/lib/agents/queryDecomposition.ts` (`decomposeQuery`).

---

## Agent 2 — strategic search queries

**Role:** For each `support_angles[].id`, propose concrete web search strategies (what to type into search), not page extracts.

**API:** `POST /api/research`  
**Body (required):** `{ "decomposition": QueryDecomposition, "yearRange"?: string }`  
**Output type:** `SearchQueries` — map **`support_angle_id` → `StrategyQueryItem[]`**

**`StrategyQueryItem` (required fields)**

| Field | Type | Example |
|--------|------|--------|
| `type` | `string` | e.g. `baseline`, `deep_dive` |
| `query` | `string` | String passed to search APIs |
| `reasoning` | `string` | Why this search |

**Implementation:** `src/lib/agents/strategicResearch.ts` (`generateStrategicResearch`).

---

## AIAnswer (answer draft + declared sources)

**Role:** First narrative answer used by the **evidence** pipeline. Not labeled “Agent N” in filenames; types call this the input to **Agent 3 (evidence)**.

**API:** `POST /api/ai-answer`  
**Body (required):** `{ "query": string, "decomposition"?: { core_query, keywords, support_angles } }`  
**Output type:** `AIAnswerOutput`

**`AIAnswerOutput`**

| Field | Type |
|--------|------|
| `answer_text` | `string` |
| `declared_sources` | `AIAnswerDeclaredSource[]` — `{ url, title? }` |

**Implementation:** `src/lib/agents/aiAnswer.ts` (`generateAIAnswer`).

---

## Agent 3 (evidence pipeline) — segments + resource plan

**Role:** (1) Split `answer_text` into `EvidenceSegment`s (quotes + `verification_challenge`). (2) Map segments to a **plan** of which URLs to use (`Agent3ResourceRow`).

**Used inside:** `POST /api/pipeline` (after AIAnswer, before Agent 6 search in that route).

**Key types:** `EvidenceSegment`, `Agent3EvidencePlan` (`evidence_segments`, `resources` with `Agent3ResourceRow`).

**`EvidenceSegment` (fields)**

| Field | Type | Notes |
|--------|------|--------|
| `segment_id` | `string` | |
| `quote_from_ai_answer` | `string` | **Exact** substring of `answer_text` (flow order) |
| `intent` | `string` | **optional** |
| `verification_challenge` | `string` | Cynical audit question |

**`Agent3ResourceRow` (fields)**

| Field | Type | Notes |
|--------|------|--------|
| `url` | `string` | |
| `segment_ids` | `string[]` | |
| `angle_id` | `string` | **optional** |
| `title` | `string \| null` | **optional** |
| `status` | `Agent3ResourceStatus` | `ok` \| `fetch_failed` \| `not_credible` \| `pending` |
| `notes` | `string` | **optional** |

**Implementation:** `src/lib/agents/agent3Segments.ts`, `src/lib/agents/agent3Evidence.ts` (`generateEvidenceSegments`, `composeAgent3EvidencePlan`).

---

## Agent 4 — page extract (bundle)

**Role:** For URLs chosen by the plan, return normalized text per URL (`RetrievedPage` in an `ExtractBundle`).

**Key type — `RetrievedPage` (fields)**

| Field | Type | Notes |
|--------|------|--------|
| `url` | `string` | |
| `author` | `string \| null` | **optional** in some JSON |
| `publication` | `string \| null` | **optional** |
| `year` | `number \| null` | **optional** |
| `cleanText` | `string` | |
| `httpStatus` | `number` | |
| `extract_error` | `string` | **optional** — when extract failed |

**Implementation:** `src/lib/agents/agent4Extract.ts` (`buildExtractBundle`); low-level: `POST /api/parallel-extract`.

---

## Agent 5 — flow-aligned crop

**Role:** After Agent 4 text exists, produce **substring-safe** crops that support each segment in order of the answer’s flow.

**Key type — `CroppedEvidenceItem` (fields)**

| Field | Type | Notes |
|--------|------|--------|
| `flow_index` | `number` | Order by first occurrence in `answer_text` |
| `segment_ids` | `string[]` | |
| `url` | `string` | |
| `cropped_text` | `string` | |
| `location_hint` | `string` | **optional** |
| `author` | `string` | **optional** |
| `publication` | `string` | **optional** |
| `year` | `number \| string` | **optional** |

**Implementation:** `src/lib/agents/agent5Crop.ts` (`generateCroppedEvidenceItems`).

---

## Agent 6 (evidence pipeline) — search / resources

**Role:** Use decomposition + AIAnswer + evidence segments to fetch/rank **resources** (Parallel), before Agent 4 extract in `/api/pipeline`.

**Key differences from Phase 2:** This path uses `src/lib/agents/agent6Search.ts` (`generateAgent6Resources`); it is **not** the same as `runAgent6ResearchTask`.

**API (standalone):** `POST /api/agent6-search` (see that route for body shape).

---

## Agent 7 — orchestrator / judge (two modes)

### 7a — `POST /api/agent7-orchestrate` (assignments only, no 3/6 loop)

**Body — required / optional**

| Field | Required? | Type |
|--------|-----------|------|
| `objective` | **yes** | `string` |
| `research_hygiene` | optional | `Record<string, unknown>` |
| `memory` | optional | `Record<string, unknown>` |
| `known_gaps_seed` | optional | `Agent7KnownGapGroup[]` |
| `key_findings` | optional | `Record<string, unknown>` |
| `dimensions` | optional | `Agent7Dimension[]` (1–16 if present) |

**Domain manual:** read from `workspace/domain-manuals/domain-manual.json` (not in body).

**Model output type:** `Agent7OrchestrateResult` — includes `objective_understanding`, `dimensions`, `key_findings`, `known_gaps`, `confidence`, `train_of_thought`, `assignments`.

### 7b — Research cycle (`POST /api/research-chat`, `orchestrateAgent7ResearchCycle`)

**Extra concerns:** `orchestration` is `delegate_research` | `deliver_to_user` | `ask_user`; **`findings_summary`** `{ key, value }` is **required**; `user_facing_document` is **required** when not delegating. Multiple `agent3_agent6` tasks in one turn run in **parallel** in the outer loop. Only **`agent3_agent6`** is executed; **`agent4_agent5`** and **`agent8`** appear in the schema for planning but are **not** run by the 7↔3/6 research loop.

**`Agent7Dimension`:** `{ label: string, description?: string }`  
**`Agent7KnownGapGroup`:** `{ dimension?: string, gaps: string[] }`  
**`Agent7Confidence`:** `{ level: "low" | "medium" | "high", rationale?: string }`

**`assignments[]` / `agent7AssignmentBodySchema` (per row)**

| Field | Required? | Notes |
|--------|-----------|--------|
| `assignee` | **yes** | `agent3_agent6` \| `agent4_agent5` \| `agent8` |
| `summary` | optional | |
| `research_task` | **required** if `assignee === "agent3_agent6"` | see below |
| `verbatim_brief` | optional | for `agent4_agent5` |
| `memory_directive` | optional | for `agent8` (memory merge instructions) |

**`research_task` / `agent7ResearchTaskSchema` (Phase 2 task schema)**

| Field | Required? | Type |
|--------|-----------|------|
| `task_id` | **yes** | `string` |
| `dimension` | **yes** | `string` |
| `factor` | **yes** | `string` |
| `goal` | **yes** | `string` |
| `context` | optional | `Record<string, unknown>` |
| `method_instructions` | optional | `string[]` |
| `variables_to_find` | optional | `string[]` |
| `calculation_logic` | optional | `string` |
| `search_guidance` | optional | `string[]` |
| `validation_criteria` | optional | `string[]` |
| `adaptation_signals` | optional | `string[]` |
| `fallback_methods` | optional | `string[]` |
| `success_criteria` | optional | `string[]` |
| `priority` | **yes** | `high` \| `medium` \| `low` |
| `expected_output_format` | optional | `string[]` |
| `follow_domain_manual` | optional | `boolean` — **`false`** skips loading `domain-manual.json` for this task; omit or `true` follows workspace manual |

**Source of truth in code:** `src/lib/agents/agent7Orchestrate.ts` (Zod), `src/lib/agents/agent7ResearchCycle.ts` (cycle schema + system prompt), `src/lib/types.ts` (TypeScript types).

---

## Agent 3 (Phase 2) + Agent 6 (Phase 2) — plan ↔ search ↔ review loop

**Role:** After Agent 7 issues a `research_task`, **Agent 3** produces an **`Agent3ResearchPlan`** (includes `agent6_assignment`: `search_objective`, `search_queries`, `extraction_notes?`). **Agent 6** runs `runAgent6ResearchTask` (Parallel + structured `extracted_key_data`). **Agent 3** returns unified **`Agent3Phase2Response`** / review, appends to **`research_log`**, and the loop can continue until `max_iterations`, **min confidence**, or stop reason.

**Key output types:** `Agent3ResearchPlan`, `Agent6ResearchRunResult`, `Agent3ResearchLogEntry`, `Agent36ResearchLoopResponse` — see `src/lib/types.ts` (lines ~230–440).

**`Agent6AssignmentFromAgent3` (required)**

| Field | Type |
|--------|------|
| `search_objective` | `string` |
| `search_queries` | `string[]` |
| `extraction_notes` | **optional** `string` |

**`Agent6ResearchRunResult` (Phase 2)**

| Field | Type |
|--------|------|
| `queries_used` | `string[]` |
| `source_urls` | `string[]` |
| `extracted_key_data` | `ExtractedKeyDatum[]` |
| `parallel_search_id` | `string \| null` | **optional** |

**`ExtractedKeyDatum`:** structured entity-style rows (see `src/lib/types.ts` and `src/lib/agents/agent6ResearchTask.ts` — many optional subfields like `entity`, `what_it_does`, `evidence_snippets`, `status`, `source_url`, etc.).

**Entry points:** `runAgent36ResearchLoop` in `src/lib/agents/agent36ResearchLoop.ts`; HTTP: `POST /api/agent3-6-research-loop`, `POST /api/agent3-phase2`, `POST /api/agent6-research-task`.

---

## Agent 4 / 5 / 8 (naming in Agent 7 only)

- **`agent4_agent5`:** In Agent 7’s **assignments**, means verbatim **extract + crop** style work. The **7↔3/6 research runner does not execute** this assignee; it is a **model-level** plan slot only (future or other tooling).
- **`agent8`:** In assignments, a **`memory_directive`** for **session memory** merge. **Not executed** in the `research-chat` / `runAgent73OrchestrationLoop` path as a separate process—**findings** and chat persistence are handled by the server and Agent 7’s **`findings_summary`** + file writes.

---

## Full-pipeline response (dual column)

**`PipelineDualColumnResponse`**

| Field | Required? | Type |
|--------|-----------|------|
| `core_query` | **yes** | `string` |
| `decomposition` | optional | `QueryDecomposition` |
| `ai_answer` | **yes** | `AIAnswerOutput` |
| `agent3_plan` | **yes** | `Agent3EvidencePlan` |
| `evidence_items` | **yes** | `CroppedEvidenceItem[]` |
| `pipeline_run_id` | optional | `string` |

**`POST /api/pipeline` body**

| Field | Required? | Notes |
|--------|-----------|--------|
| `query` | **yes** | |
| `decomposition` | optional | `QueryDecomposition` — unique `support_angles[].id` |
| `searchQueries` | optional | keys must be subset of `support_angles` ids when both present |
| `sourcePolicy` | optional | `excludeDomains`, `includeDomains`, `afterDate`, `beforeDate` |
| `pipeline_run_id` | optional | echoed in response |

---

## `POST /api/research-chat` body (strategic research turn)

| Field | Required? | Type / notes |
|--------|-----------|--------------|
| `message` | **yes** | User message / objective for the turn |
| `subject_scope` | optional | Binds subject, out-of-scope, disambiguation for Agent 7 |
| `research_hygiene` | optional | JSON object |
| `memory` | optional | JSON object |
| `known_gaps_seed` | optional | `knownGapGroup[]` |
| `key_findings` | optional | JSON object |
| `dimensions` | optional | 1–16 `Agent7Dimension` |
| `max_outer_iterations` | optional | 1–50 (default 5) |
| `min_confidence` | optional | 0–1 for inner 3/6 loop |
| `max_iterations_3_6` | optional | 1–20 (default 3) |

**Success response (subset):** `document_markdown`, `stopped`, `key_findings`, `dimensions`, `known_gaps`, `steps`, `chat_memory_path`, `user_output_path`.

---

*For diagrams and when to use which track, see **`README.md`**.*
