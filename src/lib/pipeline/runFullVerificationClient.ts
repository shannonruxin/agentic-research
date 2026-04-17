import type { ParallelSourcePolicyRequest } from "@/lib/parallelSourcePolicy";
import type {
  Agent3EvidencePlan,
  AIAnswerOutput,
  CroppedEvidenceItem,
  EvidenceSegment,
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
  /** Optional: decomposition for **`/api/agent3-segments`** / **`/api/agent6-search`** (e.g. Agent 2 JSON). */
  decompositionForAgent3?: QueryDecomposition | null;
  /** Optional: Agent 2 **`SearchQueries`** for Agent 3. */
  searchQueries?: SearchQueries | null;
  /** Optional: Parallel Search **`source_policy`** (merged with env on the server). */
  sourcePolicy?: ParallelSourcePolicyRequest | null;
};

export type FullVerificationStage = "ai-answer" | "agent3" | "agent6" | "agent4" | "agent5";

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
  const { query, decompositionForAiAnswer, decompositionForAgent3, searchQueries, sourcePolicy } =
    input;

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
  let evidence_segments: EvidenceSegment[];
  let plan: Agent3EvidencePlan;

  hooks?.onStartStage?.("agent3");
  try {
    const res = await fetch("/api/agent3-segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiAnswer: ai,
        ...(decompositionForAgent3 ? { decomposition: decompositionForAgent3 } : {}),
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
    const segPayload = data as { evidence_segments?: EvidenceSegment[] };
    if (!segPayload.evidence_segments) {
      hooks?.onEndStage?.("agent3");
      return {
        ok: false,
        stage: "agent3",
        error: "Invalid agent3-segments response",
        ai,
      };
    }
    evidence_segments = segPayload.evidence_segments;
  } catch {
    hooks?.onEndStage?.("agent3");
    return { ok: false, stage: "agent3", error: "Network error", network: true, ai };
  }
  hooks?.onEndStage?.("agent3");

  hooks?.onStartStage?.("agent6");
  try {
    const res = await fetch("/api/agent6-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiAnswer: ai,
        evidence_segments,
        ...(decompositionForAgent3 ? { decomposition: decompositionForAgent3 } : {}),
        ...(sq ? { searchQueries: sq } : {}),
        ...(sourcePolicy && Object.keys(sourcePolicy).length > 0 ? { sourcePolicy } : {}),
      }),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      hooks?.onEndStage?.("agent6");
      return {
        ok: false,
        stage: "agent6",
        error: apiErrorMessage(data, `Request failed (${res.status})`),
        ai,
      };
    }
    const resPayload = data as { resources?: Agent3EvidencePlan["resources"] };
    if (!resPayload.resources) {
      hooks?.onEndStage?.("agent6");
      return {
        ok: false,
        stage: "agent6",
        error: "Invalid agent6-search response",
        ai,
      };
    }
    plan = { evidence_segments, resources: resPayload.resources };
  } catch {
    hooks?.onEndStage?.("agent6");
    return { ok: false, stage: "agent6", error: "Network error", network: true, ai };
  }
  hooks?.onEndStage?.("agent6");

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

export type Agent345VerificationStage = Exclude<FullVerificationStage, "ai-answer">;

export type Agent345VerificationHooks = {
  onStartStage?: (stage: Agent345VerificationStage) => void;
  onEndStage?: (stage: Agent345VerificationStage) => void;
};

export type Agent345VerificationResult =
  | { ok: true; plan: Agent3EvidencePlan; bundle: ExtractBundle; items: CroppedEvidenceItem[] }
  | {
      ok: false;
      stage: Agent345VerificationStage;
      error: string;
      network?: boolean;
      plan?: Agent3EvidencePlan;
      bundle?: ExtractBundle;
    };

/**
 * Client-only: **Agent 3 → Agent 4 → Agent 5** for an existing AIAnswer (e.g. proof on a highlighted passage).
 */
export async function runAgent345VerificationClient(
  ai: AIAnswerOutput,
  options: {
    decompositionForAgent3?: QueryDecomposition | null;
    searchQueries?: SearchQueries | null;
    sourcePolicy?: ParallelSourcePolicyRequest | null;
  },
  hooks?: Agent345VerificationHooks,
): Promise<Agent345VerificationResult> {
  const { decompositionForAgent3, searchQueries, sourcePolicy } = options;
  const sq = searchQueries && Object.keys(searchQueries).length > 0 ? searchQueries : undefined;

  let evidence_segments: EvidenceSegment[];
  let plan: Agent3EvidencePlan;

  hooks?.onStartStage?.("agent3");
  try {
    const res = await fetch("/api/agent3-segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiAnswer: ai,
        ...(decompositionForAgent3 ? { decomposition: decompositionForAgent3 } : {}),
      }),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      hooks?.onEndStage?.("agent3");
      return {
        ok: false,
        stage: "agent3",
        error: apiErrorMessage(data, `Request failed (${res.status})`),
      };
    }
    const segPayload = data as { evidence_segments?: EvidenceSegment[] };
    if (!segPayload.evidence_segments) {
      hooks?.onEndStage?.("agent3");
      return { ok: false, stage: "agent3", error: "Invalid agent3-segments response" };
    }
    evidence_segments = segPayload.evidence_segments;
  } catch {
    hooks?.onEndStage?.("agent3");
    return { ok: false, stage: "agent3", error: "Network error", network: true };
  }
  hooks?.onEndStage?.("agent3");

  hooks?.onStartStage?.("agent6");
  try {
    const res = await fetch("/api/agent6-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiAnswer: ai,
        evidence_segments,
        ...(decompositionForAgent3 ? { decomposition: decompositionForAgent3 } : {}),
        ...(sq ? { searchQueries: sq } : {}),
        ...(sourcePolicy && Object.keys(sourcePolicy).length > 0 ? { sourcePolicy } : {}),
      }),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      hooks?.onEndStage?.("agent6");
      return {
        ok: false,
        stage: "agent6",
        error: apiErrorMessage(data, `Request failed (${res.status})`),
      };
    }
    const resPayload = data as { resources?: Agent3EvidencePlan["resources"] };
    if (!resPayload.resources) {
      hooks?.onEndStage?.("agent6");
      return { ok: false, stage: "agent6", error: "Invalid agent6-search response" };
    }
    plan = { evidence_segments, resources: resPayload.resources };
  } catch {
    hooks?.onEndStage?.("agent6");
    return { ok: false, stage: "agent6", error: "Network error", network: true };
  }
  hooks?.onEndStage?.("agent6");

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
        plan,
      };
    }
    bundle = data as ExtractBundle;
  } catch {
    hooks?.onEndStage?.("agent4");
    return { ok: false, stage: "agent4", error: "Network error", network: true, plan };
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
          plan,
          bundle,
        };
      }
      items = sortCroppedByFlow(data as CroppedEvidenceItem[]);
    } catch {
      hooks?.onEndStage?.("agent5");
      return { ok: false, stage: "agent5", error: "Network error", network: true, plan, bundle };
    }
    hooks?.onEndStage?.("agent5");
  }

  return { ok: true, plan, bundle, items };
}
