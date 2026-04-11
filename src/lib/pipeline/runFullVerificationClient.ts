import type {
  Agent3EvidencePlan,
  AIAnswerOutput,
  CroppedEvidenceItem,
  ExtractBundle,
  QueryDecomposition,
  SearchQueries,
} from "@/lib/types";

function sortCroppedByFlow(items: CroppedEvidenceItem[]): CroppedEvidenceItem[] {
  return [...items].sort((a, b) => {
    if (a.flow_index !== b.flow_index) return a.flow_index - b.flow_index;
    return a.url.localeCompare(b.url);
  });
}

function apiErrorMessage(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }
  return fallback;
}

export type FullVerificationInput = {
  query: string;
  /** Optional: Agent 1 decomposition for **`/api/ai-answer`** alignment. */
  decompositionForAiAnswer?: QueryDecomposition | null;
  /** Optional: decomposition for **`/api/agent3-evidence`** (e.g. Agent 2 JSON). */
  decompositionForAgent3?: QueryDecomposition | null;
  /** Optional: Agent 2 **`SearchQueries`** for Agent 3. */
  searchQueries?: SearchQueries | null;
};

export type FullVerificationStage = "ai-answer" | "agent3" | "agent4" | "agent5";

export type FullVerificationHooks = {
  onStartStage?: (stage: FullVerificationStage) => void;
  onEndStage?: (stage: FullVerificationStage) => void;
  /** Fires right after AIAnswer succeeds, before Agent 3 (show answer while evidence pipeline runs). */
  onAiAnswerReady?: (ai: AIAnswerOutput) => void;
};

export type FullVerificationResult =
  | {
      ok: true;
      ai: AIAnswerOutput;
      plan: Agent3EvidencePlan;
      bundle: ExtractBundle;
      items: CroppedEvidenceItem[];
    }
  | {
      ok: false;
      stage: FullVerificationStage;
      error: string;
      network?: boolean;
      /** Stages completed before failure (for sandbox UI). */
      ai?: AIAnswerOutput;
      plan?: Agent3EvidencePlan;
      bundle?: ExtractBundle;
    };

/**
 * Client-only: **AIAnswer → Agent 3 → Agent 4 → Agent 5** (Sandbox **Run AIAnswer & Verification**).
 */
export async function runFullVerificationClient(
  input: FullVerificationInput,
  hooks?: FullVerificationHooks,
): Promise<FullVerificationResult> {
  const { query, decompositionForAiAnswer, decompositionForAgent3, searchQueries } = input;

  let ai: AIAnswerOutput | undefined;

  hooks?.onStartStage?.("ai-answer");
  try {
    const res = await fetch("/api/ai-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        ...(decompositionForAiAnswer ? { decomposition: decompositionForAiAnswer } : {}),
      }),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      hooks?.onEndStage?.("ai-answer");
      return {
        ok: false,
        stage: "ai-answer",
        error: apiErrorMessage(data, `Request failed (${res.status})`),
      };
    }
    ai = data as AIAnswerOutput;
  } catch {
    hooks?.onEndStage?.("ai-answer");
    return { ok: false, stage: "ai-answer", error: "Network error", network: true };
  }
  hooks?.onEndStage?.("ai-answer");
  hooks?.onAiAnswerReady?.(ai);

  const sq = searchQueries && Object.keys(searchQueries).length > 0 ? searchQueries : undefined;
  let plan: Agent3EvidencePlan;

  hooks?.onStartStage?.("agent3");
  try {
    const res = await fetch("/api/agent3-evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiAnswer: ai,
        ...(decompositionForAgent3 ? { decomposition: decompositionForAgent3 } : {}),
        ...(sq ? { searchQueries: sq } : {}),
      }),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      hooks?.onEndStage?.("agent3");
      return {
        ok: false,
        stage: "agent3",
        error: apiErrorMessage(data, `Request failed (${res.status})`),
        ai,
      };
    }
    plan = data as Agent3EvidencePlan;
  } catch {
    hooks?.onEndStage?.("agent3");
    return { ok: false, stage: "agent3", error: "Network error", network: true, ai };
  }
  hooks?.onEndStage?.("agent3");

  let bundle: ExtractBundle;

  hooks?.onStartStage?.("agent4");
  try {
    const res = await fetch("/api/agent4-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiAnswer: ai, agent3Plan: plan }),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      hooks?.onEndStage?.("agent4");
      return {
        ok: false,
        stage: "agent4",
        error: apiErrorMessage(data, `Request failed (${res.status})`),
        ai,
        plan,
      };
    }
    bundle = data as ExtractBundle;
  } catch {
    hooks?.onEndStage?.("agent4");
    return { ok: false, stage: "agent4", error: "Network error", network: true, ai, plan };
  }
  hooks?.onEndStage?.("agent4");

  let items: CroppedEvidenceItem[];
  if (Object.keys(bundle).length === 0) {
    items = [];
  } else {
    hooks?.onStartStage?.("agent5");
    try {
      const res = await fetch("/api/agent5-crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiAnswer: ai, agent3Plan: plan, extractBundle: bundle }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        hooks?.onEndStage?.("agent5");
        return {
          ok: false,
          stage: "agent5",
          error: apiErrorMessage(data, `Request failed (${res.status})`),
          ai,
          plan,
          bundle,
        };
      }
      items = sortCroppedByFlow(data as CroppedEvidenceItem[]);
    } catch {
      hooks?.onEndStage?.("agent5");
      return { ok: false, stage: "agent5", error: "Network error", network: true, ai, plan, bundle };
    }
    hooks?.onEndStage?.("agent5");
  }

  return { ok: true, ai: ai!, plan, bundle, items };
}
