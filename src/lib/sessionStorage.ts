/**
 * sessionStorage.ts
 *
 * Single reusable module for all session-scoped write operations.
 * Two responsibilities:
 *   1. Append a worker's findings to that dimension's JSON file (live, during pipeline).
 *   2. Append a completed turn to the session's chat-history.json (after deliver).
 *
 * Nothing in this file calls an LLM. All writes are pure data.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getSessionDir,
  getSessionChatHistoryFile,
  readWorkspaceText,
  writeWorkspaceText,
} from "@/lib/workspaceNode";
import { dimensionIdToFilename, normalizeDimensionId } from "@/lib/dimensionId";
import { mergeResearchTurn } from "@/lib/researchSessionMemory";
import type { ResearchUserOutput } from "@/lib/researchSessionMemory";
import type { WorkerOutput } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One worker's findings for a dimension, stored verbatim — no summarization.
 * Appended to `session/sessionN/{dimension-id}.json` as the worker reports back.
 */
export type SessionWorkerFinding = {
  turn: number;
  round: number;
  task_id: string;
  dimension: string;
  factor: string;
  summary: string;
  confidence: number;
  sources: { url: string; title?: string; relevance: string; data_noted: string }[];
  extracted_data: WorkerOutput["extracted_data"];
  gaps_remaining: string[];
  search_queries_used: string[];
  rabbithole_leads: string[];
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Ensure the session directory exists before any write. */
async function ensureSessionDir(sessionId: number): Promise<void> {
  await fs.mkdir(getSessionDir(sessionId), { recursive: true });
}

/** Full path to a dimension JSON file within a session. */
function getSessionDimensionFile(sessionId: number, dimensionId: string): string {
  const base = dimensionIdToFilename(normalizeDimensionId(dimensionId));
  return path.join(getSessionDir(sessionId), `${base}.json`);
}

// ---------------------------------------------------------------------------
// 1. Append worker finding to dimension JSON
//    Called immediately after each worker completes — live, during the pipeline.
// ---------------------------------------------------------------------------

export async function appendWorkerFinding(
  sessionId: number,
  result: WorkerOutput,
  turn: number,
  round: number,
): Promise<void> {
  await ensureSessionDir(sessionId);
  const filePath = getSessionDimensionFile(sessionId, result.dimension);

  // Read existing array — empty array if file doesn't exist yet.
  let existing: SessionWorkerFinding[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) existing = parsed as SessionWorkerFinding[];
  } catch {
    existing = [];
  }

  // Build the finding entry directly from the worker result — no transformation.
  const finding: SessionWorkerFinding = {
    turn,
    round,
    task_id: result.task_id,
    dimension: result.dimension,
    factor: result.factor,
    summary: result.summary,
    confidence: result.confidence,
    sources: result.sources,
    extracted_data: result.extracted_data,
    gaps_remaining: result.gaps_remaining,
    search_queries_used: result.search_queries_used,
    rabbithole_leads: result.rabbithole_leads ?? [],
  };

  // Append — never truncate or rewrite existing entries.
  existing.push(finding);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// 2. Append completed turn to session chat history
//    Called once after deliver — mirrors what the old chat-memory.json did,
//    but scoped to the active session folder.
// ---------------------------------------------------------------------------

export async function appendChatHistoryTurn(
  sessionId: number,
  turnKey: string,
  block: { question: string; "user-output": ResearchUserOutput },
): Promise<void> {
  await ensureSessionDir(sessionId);
  const filePath = getSessionChatHistoryFile(sessionId);

  // Read existing history (empty object if first turn).
  const raw = await readWorkspaceText(filePath);

  // mergeResearchTurn handles inserting the turn in correct numeric order.
  const merged = mergeResearchTurn(raw, turnKey, block);
  await writeWorkspaceText(filePath, merged);
}
