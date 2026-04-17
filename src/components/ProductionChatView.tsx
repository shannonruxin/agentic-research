"use client";

import { useState } from "react";
import { CopyOutputButton } from "@/components/CopyOutputButton";
import { SelectableAnswerWithProof } from "@/components/SelectableAnswerWithProof";
import type { ParallelSourcePolicyRequest } from "@/lib/parallelSourcePolicy";
import {
  runAgent345VerificationClient,
  runFullVerificationClient,
  type Agent345VerificationStage,
  type FullVerificationStage,
} from "@/lib/pipeline/runFullVerificationClient";
import type { AIAnswerOutput, CroppedEvidenceItem } from "@/lib/types";

const STAGE_USER_LABEL: Record<FullVerificationStage, string> = {
  "ai-answer": "Drafting the answer",
  agent3: "Splitting the answer into checkable quotes",
  agent6: "Finding web sources for each quote",
  agent4: "Downloading source pages",
  agent5: "Aligning excerpts to the answer",
};

function productionRecoveryHint(stage: FullVerificationStage | null, errorText: string): string | null {
  if (
    (stage === "agent3" || stage === "agent6") &&
    (errorText.includes("No evidence segments could be tied") ||
      errorText.includes("exact contiguous span") ||
      errorText.includes("quote_from_ai_answer"))
  ) {
    return "The app keeps only quotes that appear verbatim in the answer. If nothing matched, try Send again, or use Sandbox: run Agent 1 (decomposition), then Run AIAnswer & Verification.";
  }
  if (stage === "agent6" && errorText.includes("Parallel")) {
    return "Check Parallel / network configuration; then try again.";
  }
  if (stage === "agent4") {
    return "Check Parallel / network configuration and declared URLs; then try again.";
  }
  if (stage === "agent5") {
    return "Crops must be verbatim from downloaded pages. Try again, or inspect results in Sandbox Agent 5.";
  }
  return null;
}

/** User-facing copy while the pipeline runs — progressive, no internal agent IDs. */
const STATUS = {
  thinking: "Thinking…",
  investigating: "Investigating how that answer holds up…",
  findingSources: "Finding sources that speak to each claim…",
  gathering: "Gathering primary text from the sources worth opening…",
  aligning: "Aligning the strongest passages with how the answer unfolds…",
} as const;

/**
 * Product UI: **AIAnswer** (left) | evidence crops in flow order (right).
 * Runs **AIAnswer → Agent 3 → Agent 4 → Agent 5** on each send (Agent 5 = final crop step).
 */
export type ProductionChatViewProps = {
  sourcePolicyRequest?: ParallelSourcePolicyRequest;
};

export function ProductionChatView({ sourcePolicyRequest }: ProductionChatViewProps) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<FullVerificationStage | null>(null);
  const [pipelineStep, setPipelineStep] = useState<string | null>(null);

  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState<AIAnswerOutput | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<CroppedEvidenceItem[] | null>(null);

  const [proofViewItems, setProofViewItems] = useState<CroppedEvidenceItem[] | null>(null);
  const [proofViewError, setProofViewError] = useState<string | null>(null);
  const [proofViewErrorStage, setProofViewErrorStage] = useState<Agent345VerificationStage | null>(
    null,
  );
  const [proofBusy, setProofBusy] = useState(false);
  const [proofStep, setProofStep] = useState<string | null>(null);
  const [proofSelectionError, setProofSelectionError] = useState<string | null>(null);

  function clearProofView() {
    setProofViewItems(null);
    setProofViewError(null);
    setProofViewErrorStage(null);
    setProofStep(null);
    setProofSelectionError(null);
  }

  function clearConversation() {
    setDraft("");
    setError(null);
    setErrorStage(null);
    setPipelineStep(null);
    setLoading(false);
    setLastUserMessage(null);
    setAiAnswer(null);
    setEvidenceItems(null);
    clearProofView();
  }

  async function runPipeline(userText: string) {
    setError(null);
    setErrorStage(null);
    setPipelineStep(STATUS.thinking);
    setAiAnswer(null);
    setEvidenceItems(null);
    clearProofView();

    const stageToStatus = {
      "ai-answer": STATUS.thinking,
      agent3: STATUS.investigating,
      agent6: STATUS.findingSources,
      agent4: STATUS.gathering,
      agent5: STATUS.aligning,
    } as const;

    const result = await runFullVerificationClient(
      { query: userText, sourcePolicy: sourcePolicyRequest },
      {
        onStartStage: (stage) => setPipelineStep(stageToStatus[stage]),
        onAiAnswerReady: (ai) => setAiAnswer(ai),
      },
    );

    setPipelineStep(null);

    if (!result.ok) {
      setError(result.error);
      setErrorStage(result.stage);
      setAiAnswer(result.ai ?? null);
      setEvidenceItems(null);
      return;
    }

    setErrorStage(null);
    setAiAnswer(result.ai);
    setEvidenceItems(result.items);
  }

  async function runSelectionProof(synthetic: AIAnswerOutput) {
    if (loading || proofBusy) {
      return;
    }
    setProofSelectionError(null);
    setProofViewError(null);
    setProofViewErrorStage(null);
    setProofViewItems(null);
    setProofBusy(true);
    const stageToStatus = {
      agent3: STATUS.investigating,
      agent6: STATUS.findingSources,
      agent4: STATUS.gathering,
      agent5: STATUS.aligning,
    } as const;
    try {
      const result = await runAgent345VerificationClient(
        synthetic,
        {
          decompositionForAgent3: null,
          searchQueries: null,
          sourcePolicy: sourcePolicyRequest ?? null,
        },
        {
          onStartStage: (stage) => setProofStep(stageToStatus[stage]),
          onEndStage: () => setProofStep(null),
        },
      );
      if (!result.ok) {
        setProofViewError(result.error);
        setProofViewErrorStage(result.stage);
        return;
      }
      setProofViewItems(result.items);
    } finally {
      setProofBusy(false);
      setProofStep(null);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || loading) {
      return;
    }
    setLastUserMessage(text);
    setDraft("");
    setLoading(true);
    try {
      await runPipeline(text);
    } finally {
      setLoading(false);
    }
  }

  /** User ran or is running Proof on a highlight — right column follows that pass. */
  const inSelectionProofFlow =
    proofBusy || proofViewItems !== null || proofViewError !== null;
  const sortedItems =
    proofViewItems !== null ? proofViewItems : (evidenceItems ?? []);
  const hasRun = lastUserMessage !== null;
  const recoveryHint =
    hasRun && error !== null && aiAnswer !== null && evidenceItems === null
      ? productionRecoveryHint(errorStage, error)
      : null;
  const selectionRecoveryHint =
    proofViewError !== null && aiAnswer !== null
      ? productionRecoveryHint(proofViewErrorStage, proofViewError)
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-200/60 text-zinc-900">
      {lastUserMessage ? (
        <div className="shrink-0 border-b border-zinc-300 bg-white px-4 py-3 text-sm shadow-sm">
          <div className="mx-auto flex max-w-[min(100%,80rem)] gap-4">
            <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-400 md:w-24">
              Your ask
            </span>
            <span className="min-w-0 text-zinc-900">{lastUserMessage}</span>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[80rem] flex-1 flex-col gap-px bg-zinc-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] md:flex-row md:gap-0">
        <section
          aria-labelledby="prod-answer-heading"
          className="flex min-h-0 min-w-0 flex-1 flex-col bg-white"
        >
          <header
            id="prod-answer-heading"
            className="shrink-0 border-b border-zinc-200 bg-gradient-to-r from-emerald-50/90 to-white px-4 py-3 md:border-r md:border-zinc-200"
          >
            <div className="flex items-start gap-3 border-l-4 border-emerald-600 pl-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800/80">
                  Left
                </p>
                <h2 className="text-sm font-semibold text-zinc-900">Answer</h2>
                <p className="text-xs text-zinc-500">AIAnswer · main narrative</p>
                {loading && aiAnswer ? (
                  <p className="mt-1 text-[11px] font-medium text-emerald-800/90">
                    Answer ready — evidence loads on the right when it’s ready.
                  </p>
                ) : null}
              </div>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto border-zinc-200 p-4 md:border-r md:border-zinc-200 md:bg-white">
            {!hasRun ? (
              <p className="text-center text-sm text-zinc-500 lg:pt-8">
                Your answer will appear here after you send a message below.
              </p>
            ) : loading && !aiAnswer ? (
              <p className="text-sm font-medium text-zinc-600">{pipelineStep ?? STATUS.thinking}</p>
            ) : aiAnswer ? (
              <div className="space-y-4">
                {proofSelectionError ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {proofSelectionError}
                  </p>
                ) : null}
                <p className="text-[11px] text-zinc-500">
                  Highlight any part of the answer, then tap <span className="font-semibold">Proof</span> to run
                  verification on that passage only.
                </p>
                <div className="flex flex-wrap gap-2">
                  <CopyOutputButton text={aiAnswer.answer_text} label="Copy answer" />
                  <CopyOutputButton text={JSON.stringify(aiAnswer, null, 2)} label="Copy JSON" />
                </div>
                <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
                  <SelectableAnswerWithProof
                    fullAnswer={aiAnswer}
                    textClassName="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800 select-text"
                    disabled={loading}
                    proofBusy={proofBusy}
                    onProof={(s) => void runSelectionProof(s)}
                    onProofInvalid={setProofSelectionError}
                  />
                </div>
                {aiAnswer.declared_sources.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Declared sources
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      {aiAnswer.declared_sources.map((s, i) => (
                        <li key={`${s.url}-${i}`}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-emerald-700 underline-offset-2 hover:underline"
                          >
                            {s.title?.trim() || s.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No answer yet.</p>
            )}
          </div>
        </section>

        <section
          aria-labelledby="prod-evidence-heading"
          className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-50"
        >
          <header
            id="prod-evidence-heading"
            className="shrink-0 border-b border-zinc-200 bg-gradient-to-r from-violet-50/80 to-zinc-50/90 px-4 py-3"
          >
            <div className="flex items-start gap-3 border-l-4 border-violet-600 pl-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-900/70">
                  Right
                </p>
                <h2 className="text-sm font-semibold text-zinc-900">Evidence</h2>
                <p className="text-xs text-zinc-600">
                  {inSelectionProofFlow
                    ? "Order follows your highlighted passage · cropped excerpts"
                    : "Same order as in the answer · cropped excerpts"}
                </p>
                {proofBusy && aiAnswer ? (
                  <p className="mt-1 text-[11px] font-medium text-violet-900/85">
                    {proofStep ?? "Preparing evidence…"}
                  </p>
                ) : loading && aiAnswer && evidenceItems === null && !error && !inSelectionProofFlow ? (
                  <p className="mt-1 text-[11px] font-medium text-violet-900/85">
                    {pipelineStep ?? "Preparing evidence…"}
                  </p>
                ) : null}
              </div>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/90 p-4 md:bg-zinc-50">
            {!hasRun ? (
              <p className="text-center text-sm text-zinc-500 lg:pt-8">
                Supporting excerpts aligned to the answer appear here, in the order they show up in
                the text.
              </p>
            ) : inSelectionProofFlow ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200/80 bg-violet-50/90 px-3 py-2 text-xs text-violet-950">
                  <span className="font-medium">Selection proof (Agent 3 → 5)</span>
                  <button
                    type="button"
                    className="shrink-0 font-semibold text-violet-800 underline-offset-2 hover:underline disabled:opacity-40"
                    disabled={proofBusy}
                    onClick={clearProofView}
                  >
                    Show full-answer evidence
                  </button>
                </div>
                {proofViewError ? (
                  <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-sm">
                    <p className="font-semibold text-amber-900">
                      {proofViewErrorStage
                        ? `Stopped during: ${STAGE_USER_LABEL[proofViewErrorStage]}`
                        : "Selection proof didn’t finish"}
                    </p>
                    <p className="mt-1.5 leading-relaxed text-amber-900/90">
                      The full answer is unchanged on the left. You can adjust the highlight and try Proof again.
                    </p>
                    {selectionRecoveryHint ? (
                      <p className="mt-3 rounded-lg border border-amber-200/70 bg-white/70 px-3 py-2 text-amber-950/95">
                        {selectionRecoveryHint}
                      </p>
                    ) : null}
                    <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-amber-900/70">
                      Technical detail
                    </p>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg border border-amber-200/80 bg-white/80 px-3 py-2 font-mono text-xs text-zinc-800">
                      {proofViewError}
                    </p>
                  </div>
                ) : proofBusy ? (
                  <p className="text-sm font-medium text-zinc-600">{proofStep ?? STATUS.investigating}</p>
                ) : proofViewItems !== null ? (
                  sortedItems.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                      No evidence crops for this selection (empty bundle or model returned no valid substrings).
                    </p>
                  ) : (
                    <>
                      <div className="mb-2 flex justify-end">
                        <CopyOutputButton
                          text={JSON.stringify(sortedItems, null, 2)}
                          label="Copy evidence JSON"
                        />
                      </div>
                      <ol className="space-y-4">
                      {sortedItems.map((item, idx) => (
                        <li
                          key={`proof-${item.url}-${item.flow_index}-${item.segment_ids.join(",")}-${idx}`}
                          className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm"
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
                              #{item.flow_index + 1}
                            </span>
                            {item.segment_ids.length > 0 ? (
                              <span className="truncate">Segments: {item.segment_ids.join(", ")}</span>
                            ) : null}
                          </div>
                          <p className="mb-3 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
                            {item.cropped_text}
                          </p>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-sm text-emerald-700 underline-offset-2 hover:underline"
                          >
                            {item.url}
                          </a>
                          {(item.author || item.publication || item.year !== undefined) && (
                            <p className="mt-2 text-xs text-zinc-500">
                              {[item.author, item.publication, item.year].filter(Boolean).join(" · ")}
                              {item.location_hint ? ` · ${item.location_hint}` : ""}
                            </p>
                          )}
                        </li>
                      ))}
                      </ol>
                    </>
                  )
                ) : null}
              </div>
            ) : error && !aiAnswer ? (
              <p className="text-sm text-zinc-500">No evidence — the answer step did not complete.</p>
            ) : error && aiAnswer && evidenceItems === null ? (
              <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-sm">
                <p className="font-semibold text-amber-900">
                  {errorStage ? `Stopped during: ${STAGE_USER_LABEL[errorStage]}` : "Evidence pass didn’t finish"}
                </p>
                <p className="mt-1.5 leading-relaxed text-amber-900/90">
                  The answer on the left may still be useful. Below is what the system reported, plus a short hint when
                  we recognize the situation.
                </p>
                {recoveryHint ? (
                  <p className="mt-3 rounded-lg border border-amber-200/70 bg-white/70 px-3 py-2 text-amber-950/95">
                    {recoveryHint}
                  </p>
                ) : null}
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-amber-900/70">
                  Technical detail
                </p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-amber-200/80 bg-white/80 px-3 py-2 font-mono text-xs text-zinc-800">
                  {error}
                </p>
              </div>
            ) : loading && evidenceItems === null && aiAnswer ? (
              <p className="text-sm font-medium text-zinc-600">{pipelineStep ?? STATUS.thinking}</p>
            ) : evidenceItems !== null ? (
              sortedItems.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No evidence crops for this run (empty bundle or model returned no valid substrings).
                </p>
              ) : (
                <>
                  <div className="mb-2 flex justify-end">
                    <CopyOutputButton
                      text={JSON.stringify(sortedItems, null, 2)}
                      label="Copy evidence JSON"
                    />
                  </div>
                  <ol className="space-y-4">
                  {sortedItems.map((item, idx) => (
                    <li
                      key={`${item.url}-${item.flow_index}-${item.segment_ids.join(",")}-${idx}`}
                      className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
                          #{item.flow_index + 1}
                        </span>
                        {item.segment_ids.length > 0 ? (
                          <span className="truncate">Segments: {item.segment_ids.join(", ")}</span>
                        ) : null}
                      </div>
                      <p className="mb-3 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
                        {item.cropped_text}
                      </p>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-sm text-emerald-700 underline-offset-2 hover:underline"
                      >
                        {item.url}
                      </a>
                      {(item.author || item.publication || item.year !== undefined) && (
                        <p className="mt-2 text-xs text-zinc-500">
                          {[item.author, item.publication, item.year].filter(Boolean).join(" · ")}
                          {item.location_hint ? ` · ${item.location_hint}` : ""}
                        </p>
                      )}
                    </li>
                  ))}
                  </ol>
                </>
              )
            ) : (
              <p className="text-sm text-zinc-500">Waiting for evidence…</p>
            )}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-zinc-300 bg-zinc-100 px-3 py-4 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] sm:px-4">
        <div className="mx-auto max-w-[80rem]">
          {pipelineStep && hasRun && aiAnswer ? (
            <p className="mb-2 text-center text-xs font-medium tracking-wide text-zinc-600">
              {pipelineStep}
            </p>
          ) : null}
          {error ? (
            <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {errorStage ? `[${STAGE_USER_LABEL[errorStage]}] ` : ""}
              {error}
            </p>
          ) : null}
          <div className="flex gap-2 rounded-[1.75rem] border border-zinc-300/90 bg-white p-2 shadow-md shadow-zinc-200/50">
            <textarea
              className="max-h-48 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400"
              placeholder="Ask a question…"
              rows={1}
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
              className="shrink-0 self-end rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              disabled={loading || !draft.trim()}
              onClick={() => void send()}
            >
              {loading ? "…" : "Send"}
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
              onClick={clearConversation}
            >
              New chat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
