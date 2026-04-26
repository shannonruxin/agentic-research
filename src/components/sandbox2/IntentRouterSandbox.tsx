"use client";

import { useState } from "react";
import { CopyOutputButton } from "@/components/CopyOutputButton";
import { INTENT_ROUTER_CHEATSHEET } from "@/lib/sandbox2SpecCheatsheet";
import type { IntentClassification } from "@/lib/types";

export type IntentRouterSandboxProps = {
  pipelineBusy?: boolean;
};

export function IntentRouterSandbox({ pipelineBusy = false }: IntentRouterSandboxProps) {
  const [message, setMessage] = useState("");
  const [conversationContext, setConversationContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<IntentClassification | null>(null);

  const disabled = pipelineBusy || loading;

  async function run() {
    const text = message.trim();
    if (!text) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/sandbox2-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          ...(conversationContext.trim() ? { conversation_context: conversationContext.trim() } : {}),
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Request failed";
        setError(err);
        return;
      }
      setOutput(data as IntentClassification);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="shrink-0 space-y-2 border-b border-zinc-200 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Intent Router
      </h2>
      <p className="text-xs text-zinc-500">
        Classifies a user message as <strong className="font-medium text-zinc-700">chat</strong> or{" "}
        <strong className="font-medium text-zinc-700">research</strong>, and detects preference signals.
        Heuristic-first, LLM fallback.
      </p>

      <div className="flex flex-wrap items-start justify-end gap-2 rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-700">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-600">
            Field definitions (spec cheatsheet)
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] text-zinc-800">
            {INTENT_ROUTER_CHEATSHEET}
          </pre>
        </details>
        <div className="shrink-0 p-1.5">
          <CopyOutputButton text={INTENT_ROUTER_CHEATSHEET} label="Copy cheatsheet" className="!bg-zinc-800 hover:!bg-zinc-900" />
        </div>
      </div>

      <label className="block text-xs font-medium text-zinc-600">Message</label>
      <textarea
        className="min-h-[72px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="Type a user message to classify…"
        value={message}
        disabled={disabled}
        onChange={(e) => setMessage(e.target.value)}
      />

      <label className="block text-xs font-medium text-zinc-600">
        conversation_context (optional — prior turn summary)
      </label>
      <textarea
        className="min-h-[56px] w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
        placeholder="Leave empty for first message"
        value={conversationContext}
        disabled={disabled}
        onChange={(e) => setConversationContext(e.target.value)}
        spellCheck={false}
      />

      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

      <button
        type="button"
        className="w-full rounded-md border border-zinc-400 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        disabled={disabled || !message.trim()}
        onClick={() => void run()}
      >
        {loading ? "Classifying…" : "Classify Intent"}
      </button>

      {output && (
        <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-800">Output</span>
            <CopyOutputButton text={JSON.stringify(output, null, 2)} label="Copy JSON" />
          </div>
          <div>
            <span className="font-semibold text-zinc-600">intent: </span>
            <span className={output.intent === "chat" ? "font-medium text-emerald-700" : "font-medium text-violet-700"}>
              {output.intent}
            </span>
          </div>
          <div>
            <span className="font-semibold text-zinc-600">has_preference_signal: </span>
            <span className={output.has_preference_signal ? "text-amber-700" : "text-zinc-500"}>
              {String(output.has_preference_signal)}
            </span>
          </div>
          <div>
            <span className="font-semibold text-zinc-600">reasoning: </span>
            <span className="whitespace-pre-wrap">{output.reasoning}</span>
          </div>
          {output.chat_reply && (
            <div>
              <span className="font-semibold text-zinc-600">chat_reply: </span>
              <span className="whitespace-pre-wrap">{output.chat_reply}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
