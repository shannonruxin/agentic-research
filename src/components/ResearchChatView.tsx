"use client";

import type { ResearchChatController } from "@/hooks/useResearchChat";

export function ResearchChatView({ chat }: { chat: ResearchChatController }) {
  const { messages, draft, setDraft, loading, error, runSend, newChat } = chat;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50">
      <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-sm font-semibold text-zinc-800">Research</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Chat-driven research. Each response updates{" "}
          <code className="rounded bg-zinc-100 px-1">user-output.md</code>,{" "}
          <code className="rounded bg-zinc-100 px-1">chat-dimension-memory/</code>, and{" "}
          <code className="rounded bg-zinc-100 px-1">chat-memory.json</code>. Use the gear menu (Settings) for
          pipeline config.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
        {messages.length === 0 && !error ? (
          <p className="text-sm text-zinc-500">Open Settings if needed, then type a question and Send.</p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i}>
            <div
              className={
                m.role === "user"
                  ? "ml-auto max-w-[min(100%,40rem)] rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-sm"
                  : "mr-auto max-w-[min(100%,48rem)] rounded-2xl border border-violet-200/80 bg-violet-50/50 px-4 py-2.5 text-sm text-zinc-900"
              }
            >
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</p>
            </div>
            {m.role === "assistant" && m.duration ? (
              <p className="mr-auto mt-1 text-[11px] text-zinc-400">{m.duration}</p>
            ) : null}
            {m.role === "assistant" && m.preference_notification ? (
              <div className="mr-auto mt-1.5 max-w-[min(100%,48rem)] rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800">
                <span className="font-medium">Preference learned: </span>
                {m.preference_notification}
              </div>
            ) : null}
          </div>
        ))}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {loading ? <p className="text-xs text-zinc-500">Researching…</p> : null}
      </div>

      <div className="shrink-0 border-t border-zinc-200 bg-zinc-100 px-3 py-3 sm:px-4">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-end gap-2">
            <textarea
              className="min-h-[44px] flex-1 resize-y rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              rows={1}
              placeholder="Message…"
              value={draft}
              disabled={loading}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void runSend();
                }
              }}
            />
            <div className="flex shrink-0 gap-2 self-end">
              <button
                type="button"
                className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                disabled={loading || !draft.trim()}
                onClick={() => void runSend()}
              >
                {loading ? "…" : "Send"}
              </button>
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="text-xs text-zinc-500 underline"
              onClick={() => void newChat()}
            >
              New chat (clears{" "}
              <code className="rounded bg-zinc-200/80 px-0.5">chat-memory.json</code> and{" "}
              <code className="rounded bg-zinc-200/80 px-0.5">chat-dimension-memory/</code>)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
