"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { CopyOutputButton } from "@/components/CopyOutputButton";
import { Agent3SegmentSandbox } from "@/components/Agent3SegmentSandbox";
import { Agent6SearchSandbox } from "@/components/Agent6SearchSandbox";
import { Agent4ExtractSandbox } from "@/components/Agent4ExtractSandbox";
import { Agent5CropSandbox } from "@/components/Agent5CropSandbox";
import { Agent7Sandbox } from "@/components/Agent7Sandbox";
import { AIAnswerSandbox } from "@/components/AIAnswerSandbox";
import { ParallelExtractSandbox } from "@/components/ParallelExtractSandbox";
import { ParallelSearchSandbox } from "@/components/ParallelSearchSandbox";
import { StrategicResearchSandbox } from "@/components/StrategicResearchSandbox";
import {
  runAgent345VerificationClient,
  runFullVerificationClient,
} from "@/lib/pipeline/runFullVerificationClient";
import type { ParallelSourcePolicyRequest } from "@/lib/parallelSourcePolicy";
import type {
  Agent3EvidencePlan,
  Agent3ResourceRow,
  AIAnswerOutput,
  CroppedEvidenceItem,
  EvidenceSegment,
  ExtractBundle,
  QueryDecomposition,
  SearchQueries,
} from "@/lib/types";

export type SandboxPipelinePageProps = {
  /** Parallel Search source_policy merged with env on the server. */
  sourcePolicyRequest?: ParallelSourcePolicyRequest;
};

export function SandboxPipelinePage({ sourcePolicyRequest }: SandboxPipelinePageProps) {
  const [queryDraft, setQueryDraft] = useState("");
  const [decomposeLoading, setDecomposeLoading] = useState(false);
  const [decomposeError, setDecomposeError] = useState<string | null>(null);
  const [decomposition, setDecomposition] = useState<QueryDecomposition | null>(null);

  const [parallelSearchObjective, setParallelSearchObjective] = useState("");
  const [parallelSearchQueriesText, setParallelSearchQueriesText] = useState("");
  const [parallelSearchMaxResults, setParallelSearchMaxResults] = useState("");
  const [parallelSearchMode, setParallelSearchMode] = useState<"" | "one-shot" | "agentic" | "fast">("");
  const [parallelSearchLoading, setParallelSearchLoading] = useState(false);
  const [parallelSearchError, setParallelSearchError] = useState<string | null>(null);
  const [parallelSearchResultJson, setParallelSearchResultJson] = useState<string | null>(null);

  const [parallelUrl, setParallelUrl] = useState("https://www.un.org/en/about-us/history-of-the-un");
  const [parallelObjective, setParallelObjective] = useState("When was the United Nations established?");
  const [parallelExcerpts, setParallelExcerpts] = useState(true);
  const [parallelFullContent, setParallelFullContent] = useState(false);
  const [parallelLoading, setParallelLoading] = useState(false);
  const [parallelError, setParallelError] = useState<string | null>(null);
  const [parallelResultJson, setParallelResultJson] = useState<string | null>(null);

  const [agent2Json, setAgent2Json] = useState("");
  const [yearRange, setYearRange] = useState("");
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<SearchQueries | null>(null);

  const [agent7Goal, setAgent7Goal] = useState("");
  const [archiveAiaAnswerOpen, setArchiveAiaAnswerOpen] = useState(false);
  const [aiAnswerTopic, setAiAnswerTopic] = useState("");
  const [aiAnswerLoading, setAiAnswerLoading] = useState(false);
  const [aiAnswerError, setAiAnswerError] = useState<string | null>(null);
  const [aiAnswerOutput, setAiAnswerOutput] = useState<AIAnswerOutput | null>(null);

  const [agent3Loading, setAgent3Loading] = useState(false);
  const [agent3Error, setAgent3Error] = useState<string | null>(null);
  const [agent6Loading, setAgent6Loading] = useState(false);
  const [agent6Error, setAgent6Error] = useState<string | null>(null);
  const [evidenceSegments, setEvidenceSegments] = useState<EvidenceSegment[] | null>(null);
  const [agent6Resources, setAgent6Resources] = useState<Agent3ResourceRow[] | null>(null);
  const [agent3Output, setAgent3Output] = useState<Agent3EvidencePlan | null>(null);
  const [agent3CustomAnswerText, setAgent3CustomAnswerText] = useState("");
  /** `aiAnswer` body that produced the current Agent 3 plan (for Agent 4/5). */
  const [agent345ContextAnswer, setAgent345ContextAnswer] = useState<AIAnswerOutput | null>(null);

  const [extractBundle, setExtractBundle] = useState<ExtractBundle | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [agent5Items, setAgent5Items] = useState<CroppedEvidenceItem[] | null>(null);
  const [agent5Loading, setAgent5Loading] = useState(false);
  const [agent5Error, setAgent5Error] = useState<string | null>(null);

  const [fullVerificationRunning, setFullVerificationRunning] = useState(false);
  const [experimentalZoneOpen, setExperimentalZoneOpen] = useState(false);
  const [verificationTargetAnswer, setVerificationTargetAnswer] = useState<AIAnswerOutput | null>(
    null,
  );
  const [proofVerificationRunning, setProofVerificationRunning] = useState(false);
  const [proofSelectionError, setProofSelectionError] = useState<string | null>(null);

  const verificationAiAnswer = verificationTargetAnswer ?? aiAnswerOutput;

  function getAiAnswerForManualAgent3(): AIAnswerOutput | null {
    const custom = agent3CustomAnswerText.trim();
    if (custom) {
      return { answer_text: custom, declared_sources: [] };
    }
    return verificationAiAnswer;
  }

  const sandboxPipelineBusy =
    aiAnswerLoading ||
    agent3Loading ||
    agent6Loading ||
    extractLoading ||
    agent5Loading ||
    fullVerificationRunning ||
    proofVerificationRunning;

  function startNewChat() {
    setQueryDraft("");
    setDecomposeLoading(false);
    setDecomposeError(null);
    setDecomposition(null);
    setAgent2Json("");
    setYearRange("");
    setResearchLoading(false);
    setResearchError(null);
    setSearchQueries(null);
    setParallelSearchObjective("");
    setParallelSearchQueriesText("");
    setParallelSearchMaxResults("");
    setParallelSearchMode("");
    setParallelSearchLoading(false);
    setParallelSearchError(null);
    setParallelSearchResultJson(null);
    setParallelUrl("https://www.un.org/en/about-us/history-of-the-un");
    setParallelObjective("When was the United Nations established?");
    setParallelExcerpts(true);
    setParallelFullContent(false);
    setParallelLoading(false);
    setParallelError(null);
    setParallelResultJson(null);
    setAgent7Goal("");
    setArchiveAiaAnswerOpen(false);
    setAiAnswerTopic("");
    setAiAnswerLoading(false);
    setAiAnswerError(null);
    setAiAnswerOutput(null);
    setAgent3Loading(false);
    setAgent3Error(null);
    setAgent6Loading(false);
    setAgent6Error(null);
    setEvidenceSegments(null);
    setAgent6Resources(null);
    setAgent3Output(null);
    setExtractBundle(null);
    setExtractLoading(false);
    setExtractError(null);
    setAgent5Items(null);
    setAgent5Loading(false);
    setAgent5Error(null);
    setFullVerificationRunning(false);
    setVerificationTargetAnswer(null);
    setProofVerificationRunning(false);
    setProofSelectionError(null);
    setAgent3CustomAnswerText("");
    setAgent345ContextAnswer(null);
  }

  function clearVerificationScope() {
    setVerificationTargetAnswer(null);
    setAgent3Output(null);
    setEvidenceSegments(null);
    setAgent6Resources(null);
    setExtractBundle(null);
    setAgent5Items(null);
    setAgent3Error(null);
    setAgent6Error(null);
    setExtractError(null);
    setAgent5Error(null);
    setAgent345ContextAnswer(null);
  }

  async function runProofOnSelection(synthetic: AIAnswerOutput) {
    if (proofVerificationRunning || fullVerificationRunning) {
      return;
    }
    setProofSelectionError(null);
    setVerificationTargetAnswer(synthetic);
    setAgent3Error(null);
    setAgent6Error(null);
    setExtractError(null);
    setAgent5Error(null);
    setAgent345ContextAnswer(null);
    setAgent3Output(null);
    setEvidenceSegments(null);
    setAgent6Resources(null);
    setExtractBundle(null);
    setAgent5Items(null);
    setProofVerificationRunning(true);
    try {
      const result = await runAgent345VerificationClient(
        synthetic,
        {
          decompositionForAgent3: getDecompositionForAgent3(),
          searchQueries,
          sourcePolicy: sourcePolicyRequest,
        },
        {
          onStartStage: (stage) => {
            if (stage === "agent3") setAgent3Loading(true);
            if (stage === "agent6") setAgent6Loading(true);
            if (stage === "agent4") setExtractLoading(true);
            if (stage === "agent5") setAgent5Loading(true);
          },
          onEndStage: (stage) => {
            if (stage === "agent3") setAgent3Loading(false);
            if (stage === "agent6") setAgent6Loading(false);
            if (stage === "agent4") setExtractLoading(false);
            if (stage === "agent5") setAgent5Loading(false);
          },
        },
      );
      if (!result.ok) {
        if (result.stage === "agent3") setAgent3Error(result.error);
        if (result.stage === "agent6") setAgent6Error(result.error);
        if (result.stage === "agent4") setExtractError(result.error);
        if (result.stage === "agent5") setAgent5Error(result.error);
        return;
      }
      setAgent3Output(result.plan);
      setEvidenceSegments(result.plan.evidence_segments);
      setAgent6Resources(result.plan.resources);
      setExtractBundle(result.bundle);
      setAgent5Items(result.items);
      setAgent345ContextAnswer(synthetic);
    } finally {
      setProofVerificationRunning(false);
    }
  }

  async function runAgent4Extract() {
    if (!agent345ContextAnswer || !agent3Output || extractLoading) {
      return;
    }
    setExtractLoading(true);
    setExtractError(null);
    setExtractBundle(null);
    setAgent5Items(null);
    setAgent5Error(null);
    try {
      const res = await fetch("/api/agent4-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiAnswer: agent345ContextAnswer,
          agent3Plan: agent3Output,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed (${res.status})`;
        setExtractError(err);
        return;
      }
      setExtractBundle(data as ExtractBundle);
    } catch {
      setExtractError("Network error");
    } finally {
      setExtractLoading(false);
    }
  }

  async function runAgent5Crop() {
    if (!agent345ContextAnswer || !agent3Output || !extractBundle || agent5Loading) {
      return;
    }
    if (Object.keys(extractBundle).length === 0) {
      setAgent5Error("Run Agent 4 first to build a non-empty ExtractBundle.");
      return;
    }
    setAgent5Loading(true);
    setAgent5Error(null);
    setAgent5Items(null);
    try {
      const res = await fetch("/api/agent5-crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiAnswer: agent345ContextAnswer,
          agent3Plan: agent3Output,
          extractBundle,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed (${res.status})`;
        setAgent5Error(err);
        return;
      }
      setAgent5Items(data as CroppedEvidenceItem[]);
    } catch {
      setAgent5Error("Network error");
    } finally {
      setAgent5Loading(false);
    }
  }

  async function runParallelSearch() {
    const objective = parallelSearchObjective.trim();
    const searchQueries = parallelSearchQueriesText
      .split(/\r?\n/)
      .map((q) => q.trim())
      .filter(Boolean);
    if ((!objective && searchQueries.length === 0) || parallelSearchLoading) {
      return;
    }
    let maxResults: number | undefined;
    const maxRaw = parallelSearchMaxResults.trim();
    if (maxRaw) {
      const n = Number.parseInt(maxRaw, 10);
      if (Number.isNaN(n) || n < 1 || n > 50) {
        setParallelSearchError("Max results must be an integer between 1 and 50.");
        return;
      }
      maxResults = n;
    }
    setParallelSearchLoading(true);
    setParallelSearchError(null);
    setParallelSearchResultJson(null);
    try {
      const body: {
        objective?: string;
        searchQueries?: string[];
        maxResults?: number;
        mode?: "one-shot" | "agentic" | "fast";
        sourcePolicy?: ParallelSourcePolicyRequest;
      } = {};
      if (objective) {
        body.objective = objective;
      }
      if (searchQueries.length > 0) {
        body.searchQueries = searchQueries;
      }
      if (maxResults !== undefined) {
        body.maxResults = maxResults;
      }
      if (parallelSearchMode) {
        body.mode = parallelSearchMode;
      }
      if (sourcePolicyRequest && Object.keys(sourcePolicyRequest).length > 0) {
        body.sourcePolicy = sourcePolicyRequest;
      }
      const res = await fetch("/api/parallel-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed (${res.status})`;
        setParallelSearchError(err);
        return;
      }
      setParallelSearchResultJson(JSON.stringify(data, null, 2));
    } catch {
      setParallelSearchError("Network error");
    } finally {
      setParallelSearchLoading(false);
    }
  }

  async function runParallelExtract() {
    const url = parallelUrl.trim();
    if (!url || parallelLoading) {
      return;
    }
    if (!parallelExcerpts && !parallelFullContent) {
      setParallelError("Enable at least one of Excerpts or Full content.");
      return;
    }
    setParallelLoading(true);
    setParallelError(null);
    setParallelResultJson(null);
    try {
      const res = await fetch("/api/parallel-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          objective: parallelObjective.trim() || undefined,
          excerpts: parallelExcerpts,
          fullContent: parallelFullContent,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed (${res.status})`;
        setParallelError(err);
        return;
      }
      setParallelResultJson(JSON.stringify(data, null, 2));
    } catch {
      setParallelError("Network error");
    } finally {
      setParallelLoading(false);
    }
  }

  function loadAgent1IntoAgent2() {
    if (!decomposition) {
      return;
    }
    setAgent2Json(JSON.stringify(decomposition, null, 2));
    setResearchError(null);
  }

  function useAgent1CoreQueryInAiAnswer() {
    if (!decomposition) {
      return;
    }
    setAiAnswerTopic(decomposition.core_query);
    setAiAnswerError(null);
  }

  /** Decomposition for Agent 3: Agent 1 state, else valid JSON in Agent 2 input. */
  function getDecompositionForAgent3(): QueryDecomposition | null {
    if (decomposition) {
      return decomposition;
    }
    const raw = agent2Json.trim();
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as QueryDecomposition;
      if (
        typeof parsed.core_query !== "string" ||
        !Array.isArray(parsed.keywords) ||
        !Array.isArray(parsed.support_angles)
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async function runAiAnswerAndVerification() {
    const topic = aiAnswerTopic.trim();
    if (!topic || sandboxPipelineBusy) {
      return;
    }

    setVerificationTargetAnswer(null);
    setProofSelectionError(null);
    setFullVerificationRunning(true);
    setAiAnswerError(null);
    setAgent3Error(null);
    setAgent6Error(null);
    setExtractError(null);
    setAgent5Error(null);
    setAiAnswerOutput(null);
    setAgent3Output(null);
    setEvidenceSegments(null);
    setAgent6Resources(null);
    setExtractBundle(null);
    setAgent5Items(null);
    setAgent345ContextAnswer(null);

    try {
      const result = await runFullVerificationClient(
        {
          query: topic,
          decompositionForAiAnswer: decomposition ?? undefined,
          decompositionForAgent3: getDecompositionForAgent3(),
          searchQueries,
          sourcePolicy: sourcePolicyRequest,
        },
        {
          onStartStage: (stage) => {
            if (stage === "ai-answer") setAiAnswerLoading(true);
            if (stage === "agent3") setAgent3Loading(true);
            if (stage === "agent6") setAgent6Loading(true);
            if (stage === "agent4") setExtractLoading(true);
            if (stage === "agent5") setAgent5Loading(true);
          },
          onEndStage: (stage) => {
            if (stage === "ai-answer") setAiAnswerLoading(false);
            if (stage === "agent3") setAgent3Loading(false);
            if (stage === "agent6") setAgent6Loading(false);
            if (stage === "agent4") setExtractLoading(false);
            if (stage === "agent5") setAgent5Loading(false);
          },
          onAiAnswerReady: (ai) => setAiAnswerOutput(ai),
        },
      );

      if (!result.ok) {
        if (result.ai) setAiAnswerOutput(result.ai);
        if (result.plan) {
          setAgent3Output(result.plan);
          setEvidenceSegments(result.plan.evidence_segments);
          setAgent6Resources(result.plan.resources);
        }
        if (result.bundle) setExtractBundle(result.bundle);
        if (result.ai && result.plan) setAgent345ContextAnswer(result.ai);
        if (result.stage === "ai-answer") setAiAnswerError(result.error);
        if (result.stage === "agent3") setAgent3Error(result.error);
        if (result.stage === "agent6") setAgent6Error(result.error);
        if (result.stage === "agent4") setExtractError(result.error);
        if (result.stage === "agent5") setAgent5Error(result.error);
        return;
      }

      setAiAnswerOutput(result.ai);
      setAgent3Output(result.plan);
      setEvidenceSegments(result.plan.evidence_segments);
      setAgent6Resources(result.plan.resources);
      setExtractBundle(result.bundle);
      setAgent5Items(result.items);
      setAgent345ContextAnswer(result.ai);
    } finally {
      setFullVerificationRunning(false);
    }
  }

  async function runAiAnswer() {
    const topic = aiAnswerTopic.trim();
    if (!topic || sandboxPipelineBusy) {
      return;
    }
    setVerificationTargetAnswer(null);
    setProofSelectionError(null);
    setAiAnswerLoading(true);
    setAiAnswerError(null);
    setAiAnswerOutput(null);
    try {
      const res = await fetch("/api/ai-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: topic,
          decomposition: decomposition ?? undefined,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed (${res.status})`;
        setAiAnswerError(err);
        return;
      }
      setAiAnswerOutput(data as AIAnswerOutput);
    } catch {
      setAiAnswerError("Network error");
    } finally {
      setAiAnswerLoading(false);
    }
  }

  async function runAgent3SegmentsOnly() {
    if (agent3Loading) {
      return;
    }
    const aiInput = getAiAnswerForManualAgent3();
    if (!aiInput) {
      setAgent3Error("Enter answer text in Agent 3, or run AIAnswer above.");
      return;
    }
    const decomp = getDecompositionForAgent3();

    setAgent3Loading(true);
    setAgent3Error(null);
    setAgent345ContextAnswer(null);
    setEvidenceSegments(null);
    setAgent6Resources(null);
    setAgent6Error(null);
    setAgent3Output(null);
    setExtractBundle(null);
    setExtractError(null);
    setAgent5Items(null);
    setAgent5Error(null);
    try {
      const res = await fetch("/api/agent3-segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiAnswer: aiInput,
          ...(decomp ? { decomposition: decomp } : {}),
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed (${res.status})`;
        setAgent3Error(err);
        return;
      }
      const payload = data as { evidence_segments?: EvidenceSegment[] };
      if (!payload.evidence_segments) {
        setAgent3Error("Invalid response from agent3-segments");
        return;
      }
      setEvidenceSegments(payload.evidence_segments);
      setAgent345ContextAnswer(aiInput);
    } catch {
      setAgent3Error("Network error");
    } finally {
      setAgent3Loading(false);
    }
  }

  async function runAgent6SearchOnly() {
    if (agent6Loading) {
      return;
    }
    const aiInput = agent345ContextAnswer ?? getAiAnswerForManualAgent3();
    if (!aiInput) {
      setAgent6Error("Run Agent 3 (segments) first, or ensure AIAnswer / answer text is available.");
      return;
    }
    if (!evidenceSegments?.length) {
      setAgent6Error("Run Agent 3 (segments) first to produce evidence_segments.");
      return;
    }
    const decomp = getDecompositionForAgent3();
    const sq = searchQueries && Object.keys(searchQueries).length > 0 ? searchQueries : undefined;

    setAgent6Loading(true);
    setAgent6Error(null);
    setAgent3Output(null);
    setExtractBundle(null);
    setExtractError(null);
    setAgent5Items(null);
    setAgent5Error(null);
    try {
      const res = await fetch("/api/agent6-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiAnswer: aiInput,
          evidence_segments: evidenceSegments,
          ...(decomp ? { decomposition: decomp } : {}),
          ...(sq ? { searchQueries: sq } : {}),
          ...(sourcePolicyRequest && Object.keys(sourcePolicyRequest).length > 0
            ? { sourcePolicy: sourcePolicyRequest }
            : {}),
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed (${res.status})`;
        setAgent6Error(err);
        return;
      }
      const payload = data as { resources?: Agent3ResourceRow[] };
      if (!payload.resources) {
        setAgent6Error("Invalid response from agent6-search");
        return;
      }
      setAgent6Resources(payload.resources);
      setAgent3Output({
        evidence_segments: evidenceSegments,
        resources: payload.resources,
      });
      setAgent345ContextAnswer(aiInput);
    } catch {
      setAgent6Error("Network error");
    } finally {
      setAgent6Loading(false);
    }
  }

  async function runResearch() {
    const raw = agent2Json.trim();
    if (!raw || researchLoading) {
      return;
    }
    let parsedDecomposition: QueryDecomposition;
    try {
      parsedDecomposition = JSON.parse(raw) as QueryDecomposition;
    } catch {
      setResearchError("Agent 2 input is not valid JSON.");
      return;
    }
    if (
      typeof parsedDecomposition.core_query !== "string" ||
      !Array.isArray(parsedDecomposition.keywords) ||
      !Array.isArray(parsedDecomposition.support_angles)
    ) {
      setResearchError("JSON must include core_query, keywords[], and support_angles[].");
      return;
    }

    setResearchLoading(true);
    setResearchError(null);
    setSearchQueries(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decomposition: parsedDecomposition,
          yearRange: yearRange.trim() ? yearRange.trim() : undefined,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed (${res.status})`;
        const received =
          typeof data === "object" && data !== null && "received" in data
            ? `\n\n${JSON.stringify((data as { received: unknown }).received, null, 2)}`
            : "";
        setResearchError(`${err}${received}`);
        return;
      }
      setSearchQueries(data as SearchQueries);
    } catch {
      setResearchError("Network error");
    } finally {
      setResearchLoading(false);
    }
  }

  async function decompose() {
    const query = queryDraft.trim();
    if (!query || decomposeLoading) {
      return;
    }
    setDecomposeLoading(true);
    setDecomposeError(null);
    setDecomposition(null);
    try {
      const res = await fetch("/api/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Decomposition failed (${res.status})`;
        setDecomposeError(err);
        return;
      }
      setDecomposition(data as QueryDecomposition);
    } catch {
      setDecomposeError("Network error");
    } finally {
      setDecomposeLoading(false);
    }
  }

  const decompositionForAgent3 = getDecompositionForAgent3();
  const decompositionSourceForAgent3: "agent1" | "agent2_input" | "none" =
    decompositionForAgent3 === null
      ? "none"
      : decomposition !== null
        ? "agent1"
        : "agent2_input";

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-10 pt-0 sm:px-6">
      <header className="flex shrink-0 items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Pipeline sandboxes</h1>
          <p className="text-xs text-zinc-500">
            Tab-local only (not saved to Convex). Reset clears all sandbox state.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          onClick={startNewChat}
        >
          Reset all
        </button>
      </header>

      <Agent7Sandbox goal={agent7Goal} onGoalChange={setAgent7Goal} pipelineBusy={sandboxPipelineBusy} />

      <section className="shrink-0 space-y-2 border-b border-zinc-200 pb-6">
        <button
          type="button"
          id="archive-aia-heading"
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition-colors hover:bg-zinc-100"
          aria-expanded={archiveAiaAnswerOpen}
          aria-controls="archive-aia-panel"
          onClick={() => setArchiveAiaAnswerOpen((o) => !o)}
        >
          <span>
            <span className="block text-sm font-semibold text-zinc-900">Archive — AIAnswer</span>
            <span className="mt-0.5 block text-xs font-normal text-zinc-500">
              Legacy direct answer + verification entry; click to {archiveAiaAnswerOpen ? "collapse" : "expand"}
            </span>
          </span>
          <ChevronDown
            className={`size-5 shrink-0 text-zinc-600 transition-transform ${archiveAiaAnswerOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {archiveAiaAnswerOpen ? (
          <div id="archive-aia-panel" role="region" aria-labelledby="archive-aia-heading" className="pt-2">
            <AIAnswerSandbox
              embedded
              topic={aiAnswerTopic}
              onTopicChange={setAiAnswerTopic}
              decomposition={decomposition}
              onUseAgent1CoreQuery={useAgent1CoreQueryInAiAnswer}
              onRun={runAiAnswer}
              onRunFullVerification={runAiAnswerAndVerification}
              pipelineBusy={sandboxPipelineBusy}
              loading={aiAnswerLoading}
              fullVerificationRunning={fullVerificationRunning}
              error={aiAnswerError}
              output={aiAnswerOutput}
              canUseAgent1={decomposition !== null}
              onProofSelection={(s) => void runProofOnSelection(s)}
              onProofSelectionInvalid={setProofSelectionError}
              proofVerificationRunning={proofVerificationRunning}
              proofSelectionError={proofSelectionError}
            />
          </div>
        ) : null}
      </section>

      {verificationTargetAnswer ? (
        <p className="-mt-2 text-xs text-violet-900/90">
          <span className="font-semibold">Verification scope:</span> highlighted passage only (Agent 3–5).{" "}
          <button
            type="button"
            className="font-medium text-violet-800 underline-offset-2 hover:underline"
            onClick={clearVerificationScope}
          >
            Use full answer for Agent 3–5
          </button>
        </p>
      ) : null}

      <Agent3SegmentSandbox
        hasPipelineAIAnswer={verificationAiAnswer !== null}
        customAnswerText={agent3CustomAnswerText}
        onCustomAnswerTextChange={setAgent3CustomAnswerText}
        onFillFromPipelineAIAnswer={() => {
          if (verificationAiAnswer) {
            setAgent3CustomAnswerText(verificationAiAnswer.answer_text);
          }
        }}
        canRun={getAiAnswerForManualAgent3() !== null}
        hasDecomposition={decompositionForAgent3 !== null}
        decompositionSource={decompositionSourceForAgent3}
        onRun={runAgent3SegmentsOnly}
        loading={agent3Loading}
        error={agent3Error}
        segments={evidenceSegments}
      />

      <Agent6SearchSandbox
        hasSegments={Boolean(evidenceSegments && evidenceSegments.length > 0)}
        segmentCount={evidenceSegments?.length ?? 0}
        hasSearchQueries={searchQueries !== null}
        onRun={runAgent6SearchOnly}
        loading={agent6Loading}
        error={agent6Error}
        composedPlan={agent3Output}
        resourcesOnly={agent6Resources}
      />

      <Agent4ExtractSandbox
        hasInputs={agent345ContextAnswer !== null && agent3Output !== null}
        onRun={runAgent4Extract}
        loading={extractLoading}
        error={extractError}
        bundle={extractBundle}
      />

      <Agent5CropSandbox
        hasInputs={
          agent345ContextAnswer !== null &&
          agent3Output !== null &&
          extractBundle !== null &&
          Object.keys(extractBundle).length > 0
        }
        onRun={runAgent5Crop}
        loading={agent5Loading}
        error={agent5Error}
        items={agent5Items}
      />

      <section className="shrink-0 border-t border-zinc-200 pt-6">
        <button
          type="button"
          id="experimental-zone-heading"
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition-colors hover:bg-zinc-100"
          aria-expanded={experimentalZoneOpen}
          aria-controls="experimental-zone-panel"
          onClick={() => setExperimentalZoneOpen((o) => !o)}
        >
          <span>
            <span className="block text-sm font-semibold text-zinc-900">Experimental zone</span>
            <span className="mt-0.5 block text-xs font-normal text-zinc-500">
              {`Agent 1 / 2, Parallel search & extract — click to ${experimentalZoneOpen ? "collapse" : "expand"}`}
            </span>
          </span>
          <ChevronDown
            className={`size-5 shrink-0 text-zinc-600 transition-transform ${experimentalZoneOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        {experimentalZoneOpen ? (
          <div
            id="experimental-zone-panel"
            role="region"
            aria-labelledby="experimental-zone-heading"
            className="mt-4 space-y-6"
          >
        <section aria-labelledby="decompose-heading" className="shrink-0 space-y-2">
          <h3 id="decompose-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Query decomposition
          </h3>
          <p className="text-xs text-zinc-500">
            Agent 1 (Query Decomposition) — JSON is built by the app from the API response, not printed by the model.
          </p>
          <textarea
            className="min-h-[72px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500"
            placeholder="Enter a question, assertion, or paragraph…"
            value={queryDraft}
            disabled={decomposeLoading}
            onChange={(e) => setQueryDraft(e.target.value)}
          />
          <button
            type="button"
            className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
            disabled={decomposeLoading || !queryDraft.trim()}
            onClick={() => void decompose()}
          >
            {decomposeLoading ? "Decomposing…" : "Decompose"}
          </button>
          {decomposeError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {decomposeError}
            </p>
          ) : null}
          {decomposition ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                  disabled={decomposeLoading}
                  onClick={() => {
                    setAiAnswerTopic(decomposition.core_query);
                    setAiAnswerError(null);
                  }}
                >
                  Send core query to AIAnswer (top)
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-600">Agent 1 output</p>
                <CopyOutputButton
                  text={JSON.stringify(decomposition, null, 2)}
                  label="Copy"
                  disabled={decomposeLoading}
                />
              </div>
              <pre className="max-h-80 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
                {JSON.stringify(decomposition, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>

        <StrategicResearchSandbox
          agent1Decomposition={decomposition}
          agent2InputJson={agent2Json}
          onAgent2InputJsonChange={setAgent2Json}
          yearRange={yearRange}
          onYearRangeChange={setYearRange}
          onLoadFromAgent1={loadAgent1IntoAgent2}
          onRunResearch={runResearch}
          loading={researchLoading}
          error={researchError}
          output={searchQueries}
        />

        <ParallelSearchSandbox
          objective={parallelSearchObjective}
          onObjectiveChange={setParallelSearchObjective}
          queriesText={parallelSearchQueriesText}
          onQueriesTextChange={setParallelSearchQueriesText}
          maxResults={parallelSearchMaxResults}
          onMaxResultsChange={setParallelSearchMaxResults}
          mode={parallelSearchMode}
          onModeChange={setParallelSearchMode}
          onRun={runParallelSearch}
          loading={parallelSearchLoading}
          error={parallelSearchError}
          resultJson={parallelSearchResultJson}
        />

        <ParallelExtractSandbox
          url={parallelUrl}
          onUrlChange={setParallelUrl}
          objective={parallelObjective}
          onObjectiveChange={setParallelObjective}
          excerpts={parallelExcerpts}
          onExcerptsChange={setParallelExcerpts}
          fullContent={parallelFullContent}
          onFullContentChange={setParallelFullContent}
          onRun={runParallelExtract}
          loading={parallelLoading}
          error={parallelError}
          resultJson={parallelResultJson}
        />
          </div>
        ) : null}
      </section>
    </div>
  );
}
