# Workspace — Storage Reference

The `workspace/` directory is the persistent file-system store for all agent state. Nothing in here is committed to git (gitignored). Everything here survives server restarts and is read/written directly by the pipeline at runtime.

---

## Directory layout

```
workspace/
│
├── session-pointer.json               ← which session is currently active
│
├── user-output.md                     ← last delivered research report (convenience copy)
│
├── global/                            ← shared across ALL sessions
│   ├── domain-manuals/
│   │   └── domain-manual.json         ← domain rules + learned user preferences
│   └── orchestrator-state/
│       ├── orchestrator-system-prompt.md   ← global orchestrator persona/instructions
│       └── learned-patterns.md             ← cross-session analytical patterns (append-only)
│
└── session/                           ← one folder per chat session
    ├── session0/
    ├── session1/
    └── session{N}/
        ├── chat-memory.json           ← full turn history for this session
        ├── {dimension-id}.json        ← worker findings for that dimension (one file per dim)
        └── orchestrator-state/
            ├── thesis-evolution.md         ← thesis + working_notes log (append-only)
            ├── open-questions.md           ← current unresolved gaps (overwritten each review)
            ├── connections.md              ← cross-dimension patterns (overwritten each review)
            └── dimension-summaries/
                └── {dimension-id}.md       ← compact summary of a concluded dimension
```

---

## session-pointer.json

```json
{ "session_id": 3 }
```

Tells the pipeline which session folder is active. Read at the start of every pipeline run. Written by:
- `/api/new-session` — increments to `N+1` (lazy: only on first send after "New chat")
- `/api/sessions/[id]` — switches to a specific session when loading history
- `/api/clear-all-sessions` — resets to `{ "session_id": 0 }`

---

## global/

Files here are **shared across every session**. Edits persist indefinitely and affect all future research runs.

### `global/domain-manuals/domain-manual.json`

The domain manual is the orchestrator's authoritative source for:
- Research process steps specific to this domain (e.g. "always check regulatory filings first for drone companies")
- User preferences learned over time (global, conditional, and pending-promotion tiers)

**Written by**: the Preferences Agent when it detects and processes user preference signals.  
**Read by**: the orchestrator PLAN phase (injected as the `domain_manual` service) and by workers when `task.follow_domain_manual !== false`.  
**Edit manually**: yes — open the file directly to add domain rules.

### `global/orchestrator-state/orchestrator-system-prompt.md`

The system prompt that defines the orchestrator's persona, analytical framework, and behavioural rules. Applies to all three phases (PLAN, REVIEW, DELIVER).

**Written by**: the developer / user manually.  
**Read by**: every orchestrator LLM call, before the phase-specific prompt.  
**Override per-session**: place a file at `session{N}/orchestrator-state/orchestrator-system-prompt.md` — if present, it takes precedence over the global one for that session only.

### `global/orchestrator-state/learned-patterns.md`

A growing log of **generalizable analytical patterns** extracted after each successful research deliver. These are methodology insights, not company facts — e.g. "when analyzing dual-use tech companies, separate defense and commercial revenue streams before applying multiples".

**Written by**: `learnedPatternsAgent` (fire-and-forget after each deliver). Entries are appended, never overwritten.  
**Read by**: the orchestrator PLAN phase (injected as the `learned_patterns` service alongside domain_manual).  
**Format**: dated markdown sections, one per session:

```markdown
## 2025-05-27 — Aerodyne Group competitive positioning analysis

### Pattern: Regulatory Timeline as Primary Risk
Drone companies' timelines are almost always gated by regulatory approval in key markets.
Prioritise the regulatory dimension in round 1 to avoid the plan being invalidated late.

### Pattern: Defense/Commercial Dual-Revenue Separation
…

---
```

---

## session/{N}/

Each session is self-contained. A session corresponds to one chat conversation — it starts on first send and ends when the user clicks "New chat" (the next send creates the next session folder).

### `chat-memory.json`

The full turn history for this session. Each turn is stored as a JSON key `"1"`, `"2"`, etc.

```json
{
  "1": {
    "question": "Tell me about Aerodyne Group",
    "user-output": {
      "summary": { "key": "Aerodyne Group Analysis", "value": { … } },
      "document": "# Aerodyne Group\n…",
      "rounds_completed": 2,
      "pipeline_trace": [ … ]
    }
  }
}
```

`summary: "in_progress"` is written as a checkpoint during the pipeline — if the server crashes, the partial trace is preserved. It gets overwritten with the real summary when deliver completes.

**Written by**: `appendChatHistoryTurn()` — called after plan, after each review (checkpoint), and after deliver (final).  
**Read by**: the pipeline at the start of each run to build `conversation_context` for the orchestrator.

### `{dimension-id}.json`

One file per research dimension. Contains an array of `SessionWorkerFinding` records — one entry per worker task that ran against this dimension.

```json
[
  {
    "turn": 1,
    "round": 1,
    "task_id": "t1_market_size",
    "dimension": "market-sizing",
    "factor": "TAM calculation",
    "summary": "…",
    "confidence": 0.82,
    "sources": [ … ],
    "extracted_data": [ … ],
    "gaps_remaining": [ … ],
    "search_queries_used": [ … ],
    "rabbithole_leads": [ … ],
    "active": true
  }
]
```

`active: true` = this finding is live and gets passed to the orchestrator on the next review.  
`active: false` = dimension has been concluded; a compact summary was generated and is now in `dimension-summaries/`. The raw finding is retained for reference but not re-injected into the orchestrator.

**Written by**: `appendWorkerFinding()` — called immediately when each worker completes (before the next worker starts).  
**Read by**: `readActiveFindings()` — before each orchestrator REVIEW and DELIVER.

---

## session/{N}/orchestrator-state/

Per-session files that carry the orchestrator's internal analytical state across turns and rounds. These are what give the system **continuity of reasoning** — not just continuity of structured outputs.

### `thesis-evolution.md`

An append-only log of the orchestrator's evolving investment thesis and working notes. A new section is added after the PLAN phase and after each REVIEW round.

```markdown
## Turn 1 — Plan

**Thesis draft:** Aerodyne is likely undervalued relative to peers given its fleet size advantage…

**Working notes:** Initial hypothesis: strong enterprise contracts but possible margin pressure…

---

## Turn 1 — Review Round 1

**Working notes:** Confirmed fleet management moat. Revenue diversification weaker than expected.

**Connections identified:**
- Enterprise contract length correlates with lower CAC in SE Asia segment
- Regulatory tailwinds in Malaysia offset slower EU approval timelines

**Contradictions flagged:**
- Crunchbase revenue figure contradicts press release — need verification

---
```

**Written by**: pipeline after PLAN and after each REVIEW.  
**Read by**: orchestrator PLAN on the next turn — injected as `[session memory — thesis evolution]` so the orchestrator picks up exactly where it left off.

### `open-questions.md`

The gaps that were identified in the last review but had no follow-up task assigned to them — either because the round limit was reached, or they were lower priority than what was dispatched.

**Overwritten** after each review (only the current state matters).

```markdown
# Open Questions (Turn 2)

These gaps were identified in the latest research but remain unaddressed.

## market-sizing
- Exact breakdown of drone-as-a-service vs hardware revenue
- SE Asia market size post-2024 regulation changes

## General
- Founding team equity structure not found
```

**Written by**: pipeline after each REVIEW — filters `known_gaps` to only those without corresponding dig_deeper tasks.  
**Read by**: orchestrator PLAN on the next turn — injected as `[session memory — open questions]`.

### `connections.md`

Cross-dimension patterns and contradictions surfaced by the `connectionAgent` after each review. This is the sub-agent's output — not the orchestrator's own connections field (which is narrower).

**Overwritten** after each review (always the latest pass).

**Written by**: `connectionAgent` fire-and-forget after each REVIEW.  
**Read by**: orchestrator REVIEW and DELIVER — injected as `connection_insights`.

### `dimension-summaries/{dimension-id}.md`

When a dimension reaches sufficient coverage (`coverage_assessment.score >= 0.75`) and receives no further dig_deeper tasks, it is **concluded**. The `dimensionSummaryAgent` generates a compact summary of everything found in that dimension and stores it here.

Going forward, the orchestrator sees only this summary, not the raw finding records. This prevents the context window from growing unboundedly across many rounds.

```markdown
## Market Sizing — Summary

**Total addressable market:** ~$45B by 2028 (CAGR 15%, multiple analysts converge)…

**Key players by segment:**
- Inspection: Percepto, Skydio
- Logistics: Wing (Alphabet), Zipline
…

Gaps: precise SE Asia sub-segment breakdown unavailable.
```

**Written by**: `dimensionSummaryAgent` when dimension is concluded.  
**Read by**: orchestrator REVIEW and DELIVER — injected as `inactive_summaries`.

---

## How a session flows end-to-end

```
User sends message
    │
    ▼
Pipeline reads session-pointer.json → gets sessionId
    │
    ▼
Reads from disk before planning:
  - session{N}/chat-memory.json                → conversation context
  - session{N}/orchestrator-state/thesis-evolution.md   → prior thesis thread
  - session{N}/orchestrator-state/open-questions.md     → prior unresolved gaps
  - global/orchestrator-state/learned-patterns.md       → cross-session patterns
  - global/domain-manuals/domain-manual.json            → domain rules + preferences
    │
    ▼
Orchestrator PLAN
    │
    ├── Writes: thesis-evolution.md (appended — plan entry)
    ├── Writes: chat-memory.json checkpoint
    │
    ▼
Workers run in parallel
    │
    ├── Each worker writes: {dimension-id}.json (live, as it finishes)
    │
    ▼
Orchestrator REVIEW
    │
    ├── Reads: {dimension-id}.json (active findings only)
    ├── Reads: dimension-summaries/ (concluded dimensions)
    ├── Reads: connections.md
    │
    ├── Writes: thesis-evolution.md (appended — review entry)
    ├── Writes: open-questions.md (overwritten)
    ├── Writes: chat-memory.json checkpoint
    │
    ├── [fire-and-forget] dimensionSummaryAgent → dimension-summaries/{dim}.md + marks active:false
    ├── [fire-and-forget] connectionAgent → connections.md (overwritten)
    │
    ├── If dig_deeper → back to Workers
    │
    ▼
Orchestrator DELIVER
    │
    ├── Reads: {dimension-id}.json (final active findings)
    ├── Reads: dimension-summaries/ + connections.md
    │
    ├── Writes: user-output.md (final report)
    ├── Writes: chat-memory.json (final turn — replaces in_progress stub)
    │
    ├── [fire-and-forget] learnedPatternsAgent → global/learned-patterns.md (appended)
```

---

## Adding a new global service

To add a new data source that the orchestrator can use at PLAN time:

1. Add a path constant to `workspaceNode.ts`
2. Add the key to `OrchestratorServices` in `orchestrator.ts`
3. Add a rendering block in `buildServicesBlock()` in `orchestrator.ts`
4. Load and pass it in `runParallelPipeline.ts` alongside `domain_manual` and `learned_patterns`

The orchestrator prompt picks it up automatically — no other changes needed.
