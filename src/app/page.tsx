"use client";

import { useState } from "react";
import { Agent3EvidenceSandbox } from "@/components/Agent3EvidenceSandbox";
import { Agent4ExtractSandbox } from "@/components/Agent4ExtractSandbox";
import { Agent5CropSandbox } from "@/components/Agent5CropSandbox";
import { AIAnswerSandbox } from "@/components/AIAnswerSandbox";
import { ParallelExtractSandbox } from "@/components/ParallelExtractSandbox";
import { ParallelSearchSandbox } from "@/components/ParallelSearchSandbox";
import { StrategicResearchSandbox } from "@/components/StrategicResearchSandbox";
import type {
  Agent3EvidencePlan,
  AIAnswerOutput,
  CroppedEvidenceItem,
  ExtractBundle,
  QueryDecomposition,
  SearchQueries,
} from "@/lib/types";

export default function Home() {
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

  const [aiAnswerTopic, setAiAnswerTopic] = useState("");
  const [aiAnswerLoading, setAiAnswerLoading] = useState(false);
  const [aiAnswerError, setAiAnswerError] = useState<string | null>(null);
  const [aiAnswerOutput, setAiAnswerOutput] = useState<AIAnswerOutput | null>(null);

  const [agent3Loading, setAgent3Loading] = useState(false);
  const [agent3Error, setAgent3Error] = useState<string | null>(null);
  const [agent3Output, setAgent3Output] = useState<Agent3EvidencePlan | null>(null);

  const [extractBundle, setExtractBundle] = useState<ExtractBundle | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [agent5Items, setAgent5Items] = useState<CroppedEvidenceItem[] | null>(null);
  const [agent5Loading, setAgent5Loading] = useState(false);
  const [agent5Error, setAgent5Error] = useState<string | null>(null);

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
    setAiAnswerTopic("");
    setAiAnswerLoading(false);
    setAiAnswerError(null);
    setAiAnswerOutput(null);
    setAgent3Loading(false);
    setAgent3Error(null);
    setAgent3Output(null);
    setExtractBundle(null);
    setExtractLoading(false);
    setExtractError(null);
    setAgent5Items(null);
    setAgent5Loading(false);
    setAgent5Error(null);
  }

  async function runAgent4Extract() {
    if (!aiAnswerOutput || !agent3Output || extractLoading) {
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
          aiAnswer: aiAnswerOutput,
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
    if (!aiAnswerOutput || !agent3Output || !extractBundle || agent5Loading) {
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
          aiAnswer: aiAnswerOutput,
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

  async function runAiAnswer() {
    const topic = aiAnswerTopic.trim();
    if (!topic || aiAnswerLoading) {
      return;
    }
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

  async function runAgent3Evidence() {
    if (agent3Loading) {
      return;
    }
    if (!aiAnswerOutput) {
      setAgent3Error("Run AIAnswer first.");
      return;
    }
    const decomp = getDecompositionForAgent3();
    const sq = searchQueries && Object.keys(searchQueries).length > 0 ? searchQueries : undefined;

    setAgent3Loading(true);
    setAgent3Error(null);
    setAgent3Output(null);
    setExtractBundle(null);
    setExtractError(null);
    setAgent5Items(null);
    setAgent5Error(null);
    try {
      const res = await fetch("/api/agent3-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiAnswer: aiAnswerOutput,
          ...(decomp ? { decomposition: decomp } : {}),
          ...(sq ? { searchQueries: sq } : {}),
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
      setAgent3Output(data as Agent3EvidencePlan);
    } catch {
      setAgent3Error("Network error");
    } finally {
      setAgent3Loading(false);
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
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col gap-6 p-4 pb-10">
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

      <AIAnswerSandbox
        topic={aiAnswerTopic}
        onTopicChange={setAiAnswerTopic}
        decomposition={decomposition}
        onUseAgent1CoreQuery={useAgent1CoreQueryInAiAnswer}
        onRun={runAiAnswer}
        loading={aiAnswerLoading}
        error={aiAnswerError}
        output={aiAnswerOutput}
        canUseAgent1={decomposition !== null}
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

      <Agent3EvidenceSandbox
        hasAIAnswer={aiAnswerOutput !== null}
        hasDecomposition={decompositionForAgent3 !== null}
        decompositionSource={decompositionSourceForAgent3}
        hasSearchQueries={searchQueries !== null}
        onRun={runAgent3Evidence}
        loading={agent3Loading}
        error={agent3Error}
        output={agent3Output}
      />

      <Agent4ExtractSandbox
        hasInputs={aiAnswerOutput !== null && agent3Output !== null}
        onRun={runAgent4Extract}
        loading={extractLoading}
        error={extractError}
        bundle={extractBundle}
      />

      <Agent5CropSandbox
        hasInputs={
          aiAnswerOutput !== null &&
          agent3Output !== null &&
          extractBundle !== null &&
          Object.keys(extractBundle).length > 0
        }
        onRun={runAgent5Crop}
        loading={agent5Loading}
        error={agent5Error}
        items={agent5Items}
      />

      <section
        aria-labelledby="experimental-zone-heading"
        className="shrink-0 space-y-6 border-t border-zinc-200 pt-8"
      >
        <h2 id="experimental-zone-heading" className="text-sm font-semibold text-zinc-900">
          Experimental Zone
        </h2>

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
      </section>
    </div>
  );
}
