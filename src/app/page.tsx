"use client";

import { useState } from "react";
import { ParallelExtractSandbox } from "@/components/ParallelExtractSandbox";
import { ParallelSearchSandbox } from "@/components/ParallelSearchSandbox";
import { StrategicResearchSandbox } from "@/components/StrategicResearchSandbox";
import type { QueryDecomposition, SearchQueries } from "@/lib/types";

type BubbleRole = "user" | "assistant";

type ChatBubble = {
  id: string;
  role: BubbleRole;
  text: string;
};

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function startNewChat() {
    setMessages([]);
    setDraft("");
    setError(null);
    setLoading(false);
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

  async function send() {
    const text = draft.trim();
    if (!text || loading) {
      return;
    }

    const userBubble: ChatBubble = { id: newId(), role: "user", text };
    setMessages((prev) => [...prev, userBubble]);
    setDraft("");
    setLoading(true);
    setError(null);

    const historyForApi: { role: BubbleRole; text: string }[] = [
      ...messages.map(({ role, text: t }) => ({ role, text: t })),
      { role: "user", text },
    ];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForApi }),
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
        setError(err);
        return;
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "reply" in data &&
        typeof (data as { reply: unknown }).reply === "string"
      ) {
        const replyText = (data as { reply: string }).reply;
        setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: replyText }]);
      } else {
        setError("Unexpected response shape");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col gap-6 p-4 pb-10">
      <header className="flex shrink-0 items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">LLM chat (Bedrock)</h1>
          <p className="text-xs text-zinc-500">
            History is in this tab only (not saved to Convex). New chat resets chat, Agent 1, Parallel search/extract,
            and Agent 2 sandbox state.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          onClick={startNewChat}
        >
          New chat
        </button>
      </header>

      <section aria-labelledby="chat-heading" className="flex min-h-0 flex-1 flex-col gap-2">
        <h2 id="chat-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Chat
        </h2>
      <div className="min-h-0 max-h-[min(50vh,28rem)] flex-1 space-y-3 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/80 p-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Messages appear here. Set Bedrock in <code className="rounded bg-white px-1">.env.local</code>.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-3 py-2 text-sm text-white"
                    : "max-w-[85%] rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm"
                }
              >
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  {m.role === "user" ? "You" : "Assistant"}
                </p>
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            </div>
          ))
        )}
        {loading ? (
          <p className="text-center text-xs text-zinc-500">Assistant is thinking…</p>
        ) : null}
      </div>

      {error ? (
        <p className="shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="shrink-0 space-y-2">
        <textarea
          className="min-h-[88px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500"
          placeholder="Message…"
          value={draft}
          disabled={loading}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={loading || !draft.trim()}
          onClick={() => void send()}
        >
          {loading ? "Sending…" : "Send"}
        </button>
      </div>
      </section>

      <section aria-labelledby="decompose-heading" className="shrink-0 space-y-2 border-t border-zinc-200 pt-6">
        <h2 id="decompose-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Query decomposition
        </h2>
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
          <pre className="max-h-80 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify(decomposition, null, 2)}
          </pre>
        ) : null}
      </section>

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
    </div>
  );
}
