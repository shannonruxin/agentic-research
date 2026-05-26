"use client";

import {
  ArrowUp,
  Eye,
  History,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeft,
  Settings,
} from "lucide-react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import remarkGfm from "remark-gfm";
import type { ResearchChatController } from "@/hooks/useResearchChat";
import type { SessionListItem } from "@/app/api/sessions/route";
import type { ParallelSourcePolicyMenuProps } from "@/components/ParallelSourcePolicyMenu";
import { ParallelSourcePolicyMenu } from "@/components/ParallelSourcePolicyMenu";
import type { ParallelPipelineStep, WorkerSourceRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Claire demo theme — radial wash from center (#cbe6ae → gray/white) */
const demoPageBgStyle: CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "radial-gradient(ellipse 92% 78% at 50% 42%, #cbe6ae 0%, #ccdbc0 22%, #d6d6d1 48%, #e9e8e5 70%, #f5f4f2 86%, #ffffff 100%)",
};

const CYCLING_PLACEHOLDERS = [
  "Run fundamental analysis on companies in my workspace...",
  "Compare valuation multiples across AI infrastructure startups...",
  "Find market signals investors may be missing in the semiconductor sector...",
  "Summarize earnings calls and highlight management sentiment changes...",
  "Screen for high-growth companies with improving operating margins...",
  "Analyze competitive positioning for cybersecurity companies in Southeast Asia...",
  "Build an investment memo on renewable energy companies exposed to grid expansion...",
] as const;

const TYPE_MS = 28;
const HOLD_MS = 5000;
const DELETE_MS = 18;

type DemoComposerProps = {
  draft: string;
  setDraft: (v: string) => void;
  loading: boolean;
  runSend: () => void | Promise<void>;
  /** Cycling prompt suggestions; off after chat has started */
  showSuggestionHints?: boolean;
  /** Tall landing composer vs compact bar after chat starts */
  variant?: "hero" | "chat";
  /** E.g. filter control placed left of send */
  filterSlot?: ReactNode;
};

function DemoComposer({
  draft,
  setDraft,
  loading,
  runSend,
  showSuggestionHints = true,
  variant = "hero",
  filterSlot,
}: DemoComposerProps) {
  const isHero = variant === "hero";
  const minHeightPx = isHero ? 72 : 48;
  const maxHeightPx = 208;
  const [composerFocused, setComposerFocused] = useState(false);
  const [cycleText, setCycleText] = useState("");
  const phraseIndexRef = useRef(0);
  const draftRef = useRef(draft);
  const focusedRef = useRef(composerFocused);
  const loadingRef = useRef(loading);
  const showHintsRef = useRef(showSuggestionHints);

  draftRef.current = draft;
  focusedRef.current = composerFocused;
  loadingRef.current = loading;
  showHintsRef.current = showSuggestionHints;

  useEffect(() => {
    if (!showSuggestionHints) {
      setCycleText("");
      return;
    }
    if (draft !== "" || composerFocused || loading) {
      setCycleText("");
      return;
    }

    const cancelled = { current: false };

    const runCycle = async () => {
      while (!cancelled.current) {
        if (
          !showHintsRef.current ||
          draftRef.current !== "" ||
          focusedRef.current ||
          loadingRef.current
        )
          break;

        const full = CYCLING_PLACEHOLDERS[phraseIndexRef.current % CYCLING_PLACEHOLDERS.length];
        let aborted = false;

        for (let i = 0; i <= full.length; i++) {
          if (
            cancelled.current ||
            !showHintsRef.current ||
            draftRef.current !== "" ||
            focusedRef.current ||
            loadingRef.current
          ) {
            aborted = true;
            break;
          }
          setCycleText(full.slice(0, i));
          await new Promise((r) => setTimeout(r, TYPE_MS));
        }
        if (aborted) break;

        const holdUntil = Date.now() + HOLD_MS;
        while (Date.now() < holdUntil) {
          if (
            cancelled.current ||
            !showHintsRef.current ||
            draftRef.current !== "" ||
            focusedRef.current ||
            loadingRef.current
          ) {
            aborted = true;
            break;
          }
          await new Promise((r) => setTimeout(r, Math.min(120, holdUntil - Date.now())));
        }
        if (aborted) break;

        for (let i = full.length; i >= 0; i--) {
          if (
            cancelled.current ||
            !showHintsRef.current ||
            draftRef.current !== "" ||
            focusedRef.current ||
            loadingRef.current
          ) {
            aborted = true;
            break;
          }
          setCycleText(full.slice(0, i));
          await new Promise((r) => setTimeout(r, DELETE_MS));
        }
        if (aborted) break;

        phraseIndexRef.current = (phraseIndexRef.current + 1) % CYCLING_PLACEHOLDERS.length;
      }
    };

    void runCycle();

    return () => {
      cancelled.current = true;
    };
  }, [draft, composerFocused, loading, showSuggestionHints]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (el.value === "") {
      el.style.height = `${minHeightPx}px`;
    } else {
      el.style.height = "0px";
      el.style.height = `${Math.min(Math.max(el.scrollHeight, minHeightPx), maxHeightPx)}px`;
    }
  }, [variant, minHeightPx, maxHeightPx]);

  const showCyclingOverlay = showSuggestionHints && draft === "" && !composerFocused && !loading;

  return (
    <div
      className={cn(
        "flex w-full max-w-3xl gap-2 border border-[#171616]/14 bg-white/80 shadow-[0_8px_30px_rgba(23,22,22,0.07)] backdrop-blur-sm",
        isHero ? "items-end rounded-[28px] px-3 py-2.5" : "items-center rounded-[22px] px-2.5 py-1.5",
      )}
    >
      <div className={cn("relative flex min-w-0 flex-1 flex-col", isHero ? "min-h-[72px]" : "min-h-[48px]")}>
        <textarea
          ref={textareaRef}
          className={cn(
            "relative z-0 max-h-52 w-full flex-1 resize-none bg-transparent text-[17px] leading-[1.75] tracking-[0.0125em] text-[#171616] outline-none placeholder:text-[#171616]/42",
            isHero ? "min-h-[72px] px-3 pb-3 pt-3" : "min-h-[48px] px-2.5 py-2",
          )}
          placeholder=""
          rows={1}
          value={draft}
          disabled={loading}
          aria-label="Write a research prompt for Claire"
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            if (!v) {
              e.currentTarget.style.height = `${minHeightPx}px`;
            }
          }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "0px";
            t.style.height = `${Math.min(Math.max(t.scrollHeight, minHeightPx), maxHeightPx)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void runSend();
            }
          }}
        />
        {showCyclingOverlay ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-10 overflow-hidden text-left text-[17px] leading-[1.75] tracking-[0.0125em] text-[#171616]/42 [overflow-wrap:anywhere]",
              isHero ? "px-3 pb-3 pt-3" : "px-2.5 pb-2 pt-2",
            )}
            aria-hidden
          >
            {cycleText}
          </div>
        ) : null}
      </div>
      {filterSlot ? (
        <div className={cn("flex shrink-0 items-center gap-1", isHero && "mb-1")}>
          {filterSlot}
          <button
            type="button"
            aria-label="Send message"
            disabled={loading || !draft.trim()}
            onClick={() => void runSend()}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#171616] text-[#faf8f5] shadow-md transition-opacity disabled:pointer-events-none disabled:bg-[#171616]/28 disabled:shadow-none"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label="Send message"
          disabled={loading || !draft.trim()}
          onClick={() => void runSend()}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-[#171616] text-[#faf8f5] shadow-md transition-opacity disabled:pointer-events-none disabled:bg-[#171616]/28 disabled:shadow-none",
            isHero && "mb-1",
          )}
        >
          <ArrowUp className="size-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-8 first:mt-0 text-[1.375rem] font-semibold tracking-tight text-[#171616]">{children}</h1>
  ),
  h2: ({ children }) => <h2 className="mb-2 mt-6 text-xl font-semibold tracking-tight text-[#171616]">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-semibold text-[#171616]">{children}</h3>,
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="[overflow-wrap:anywhere]">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-[#171616]/35 pl-4 text-[#171616]/82 italic">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-orange-900 underline decoration-orange-900/25 underline-offset-[3px] hover:decoration-orange-900/60"
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-7 border-[#171616]/12" />,
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-lg border border-[#171616]/12 bg-white/90">
      <table className="w-full border-collapse text-left text-[0.9375rem]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[#171616]/12 bg-[#171616]/6 px-3 py-2 text-[0.75rem] font-semibold uppercase tracking-wide text-[#171616]/72">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-[#171616]/08 px-3 py-2">{children}</td>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (!isBlock) {
      return (
        <code className="rounded bg-[#171616]/10 px-1.5 py-0.5 text-[0.88em] text-[#171616] not-italic">
          {children}
        </code>
      );
    }
    return (
      <code className={cn(className, "text-[13px] leading-relaxed text-zinc-100 not-italic")}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-[13px] text-zinc-100 shadow-inner">
      {children}
    </pre>
  ),
};

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className={cn("min-w-0 text-[17px] leading-[1.75] tracking-[0.0125em] text-[#171616]", "[overflow-wrap:anywhere]")}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

type FlatSourceCitation = WorkerSourceRow & {
  taskId: string;
  round: number;
  dimension: string;
  factor: string;
};

function flattenWorkerSourceCitations(steps: ParallelPipelineStep[] | undefined): FlatSourceCitation[] {
  if (!steps?.length) return [];
  const out: FlatSourceCitation[] = [];
  for (const s of steps) {
    if (s.kind !== "worker") continue;
    for (const src of s.result.sources) {
      out.push({
        taskId: s.task_id,
        round: s.round,
        dimension: s.result.dimension,
        factor: s.result.factor,
        ...src,
      });
    }
  }
  return out;
}

function workerStepsFingerprint(steps: ParallelPipelineStep[] | undefined): string {
  if (!steps?.length) return "";
  return steps
    .filter((x): x is Extract<ParallelPipelineStep, { kind: "worker" }> => x.kind === "worker")
    .map((w) => `${w.round}:${w.task_id}:${w.result.sources.map((r) => `${r.url}:${r.verbatim_extract?.length ?? 0}`).join(",")}`)
    .join("|");
}

function VerbatimSourcesColumn({ steps }: { steps: ParallelPipelineStep[] | undefined }) {
  const citations = useMemo(() => flattenWorkerSourceCitations(steps), [steps]);
  const fingerprint = useMemo(() => workerStepsFingerprint(steps), [steps]);
  const [visible, setVisible] = useState(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (!citations.length) {
      setVisible(0);
      return;
    }
    setVisible(0);
    const staggerMs = 90;
    const initialMs = 200;
    for (let i = 0; i < citations.length; i++) {
      const id = window.setTimeout(() => {
        setVisible((v) => Math.max(v, i + 1));
      }, initialMs + i * staggerMs);
      timersRef.current.push(id);
    }
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [fingerprint, citations.length]);

  if (!citations.length) {
    return (
      <div className="rounded-xl border border-[#171616]/10 bg-white/50 px-3 py-4 text-sm leading-relaxed text-[#171616]/55">
        No source URLs from research workers for this turn. Chat-only replies and fast paths do not include extractable
        pages.
      </div>
    );
  }

  const shown = citations.slice(0, visible);

  return (
    <ul className="min-w-0 space-y-3">
      {shown.map((c, idx) => (
        <li
          key={`${c.taskId}-${idx}-${c.url}`}
          className="animate-in fade-in rounded-xl border border-[#171616]/12 bg-white/75 px-3 py-3 text-sm leading-[1.75] tracking-[0.0125em] text-[#171616] shadow-sm backdrop-blur-sm duration-200 [overflow-wrap:anywhere]"
        >
          {c.title ? (
            <a
              href={c.url}
              className="mb-2 block text-[0.8125rem] font-semibold text-orange-900 underline decoration-orange-900/25 underline-offset-2 hover:decoration-orange-900/55"
              target="_blank"
              rel="noreferrer noopener"
            >
              {c.title}
            </a>
          ) : (
            <a
              href={c.url}
              className="mb-2 block break-all text-[0.8125rem] font-medium text-orange-900 underline decoration-orange-900/25 underline-offset-2 hover:decoration-orange-900/55"
              target="_blank"
              rel="noreferrer noopener"
            >
              {c.url}
            </a>
          )}
          {c.relevance ? (
            <p className="mb-2 text-[0.9375rem] leading-relaxed text-[#171616]/88">
              <span className="font-semibold text-[#171616]">Relevance: </span>
              {c.relevance}
            </p>
          ) : null}
          {c.verbatim_extract ? (
            <blockquote className="mt-0 max-h-[min(70vh,32rem)] overflow-y-auto whitespace-pre-wrap border-l-2 border-[#2d5538]/45 pl-3 text-[0.9375rem] leading-relaxed text-[#171616]/88">
              {c.verbatim_extract}
            </blockquote>
          ) : c.data_noted ? (
            <p className="text-[0.9375rem] leading-relaxed text-[#171616]/88">
              <span className="font-semibold text-[#171616]">No extract returned. </span>
              {c.data_noted}
            </p>
          ) : (
            <p className="text-[0.9375rem] leading-relaxed text-[#171616]/55">No extract text for this URL.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function DemoChatView({
  chat,
  sourcePolicyMenuProps,
  settingsOpen = false,
  onOpenSettings,
}: {
  chat: ResearchChatController;
  sourcePolicyMenuProps: ParallelSourcePolicyMenuProps;
  settingsOpen?: boolean;
  onOpenSettings: () => void;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sourcesSplitOpen, setSourcesSplitOpen] = useState(false);
  const [sessionItems, setSessionItems] = useState<SessionListItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const {
    messages,
    draft,
    setDraft,
    loading,
    error,
    runSend,
    newChat,
    loadSession,
    sessionRevision,
  } = chat;

  const chatStarted = messages.length > 0;

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/sessions");
      const data: unknown = await res.json().catch(() => ({}));
      const sessions =
        typeof data === "object" && data !== null && "sessions" in data && Array.isArray((data as { sessions: unknown }).sessions)
          ? (data as { sessions: SessionListItem[] }).sessions
          : [];
      setSessionItems(sessions);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sidebarOpen) void refreshSessions();
    else setSessionItems([]);
  }, [sidebarOpen, sessionRevision, refreshSessions]);

  const composerFilter = (
    <>
      <button
        type="button"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[#2d5538] transition-colors hover:bg-[#171616]/8 disabled:opacity-40",
          sourcesSplitOpen && "bg-[#171616]/10 text-[#171616] ring-2 ring-[#2d5538]/35 ring-offset-2 ring-offset-white/80",
        )}
        aria-pressed={sourcesSplitOpen}
        aria-label={sourcesSplitOpen ? "Hide source citations column" : "Show source citations beside answer"}
        title={sourcesSplitOpen ? "Hide sources" : "Show sources"}
        onClick={() => setSourcesSplitOpen((v) => !v)}
      >
        <Eye className="size-[18px] shrink-0" strokeWidth={2} aria-hidden />
      </button>
      <ParallelSourcePolicyMenu
        {...sourcePolicyMenuProps}
        visualTheme="demo"
        inlineTrigger
        showTrigger
        triggerIconOnly
      />
    </>
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatStarted) return;
    bottomRef.current?.scrollIntoView({ behavior: messages.length <= 1 ? "auto" : "smooth" });
  }, [chatStarted, messages.length, loading, sourcesSplitOpen]);

  return (
    <div className="font-claire flex min-h-0 flex-1 text-[#171616]" style={demoPageBgStyle}>
      <aside
        className={cn(
          "flex shrink-0 flex-col border-[#171616]/12 bg-[#e2ead8]/75 backdrop-blur-md transition-[width,opacity] duration-200 ease-out",
          sidebarOpen ? "w-[min(16rem,88vw)] border-r" : "w-0 overflow-hidden border-transparent opacity-0",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#171616]/80 hover:bg-[#171616]/10"
          >
            <PanelLeftClose className="size-4 shrink-0" />
            Hide sidebar
          </button>
          <button
            type="button"
            onClick={() => void newChat()}
            className="flex items-center gap-2 rounded-lg border border-[#171616]/18 bg-white/75 px-3 py-2.5 text-left text-sm font-medium text-[#171616] shadow-sm backdrop-blur-sm hover:bg-white/90"
          >
            <MessageSquarePlus className="size-4 shrink-0" />
            New chat
          </button>
          <div className="mt-3 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-[#171616]/50">
            <History className="size-3.5 opacity-70" aria-hidden />
            Chat history
          </div>
          {sessionsLoading ? (
            <p className="px-3 py-2 text-xs text-[#171616]/50">Loading…</p>
          ) : sessionItems.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#171616]/50">No sessions yet.</p>
          ) : (
            <ul className="flex min-h-0 flex-col gap-1">
              {sessionItems.map((item) => (
                <li key={item.sessionId}>
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await loadSession(item.sessionId);
                      if (out.ok) setSidebarOpen(false);
                    }}
                    className="w-full rounded-lg border border-transparent bg-[#171616]/6 px-3 py-2 text-left text-sm text-[#171616] transition-colors hover:border-[#171616]/12 hover:bg-white/80"
                  >
                    <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">{item.title}</span>
                    <span className="mt-0.5 block text-[11px] text-[#171616]/45">
                      {item.turnCount} {item.turnCount === 1 ? "turn" : "turns"} ·{" "}
                      {new Date(item.savedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-auto shrink-0 border-t border-[#171616]/12 p-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#171616]/80 hover:bg-[#171616]/10",
              settingsOpen && "bg-[#171616]/12 text-[#171616]",
            )}
            aria-expanded={settingsOpen}
            title="Settings"
          >
            <Settings className="size-4 shrink-0" aria-hidden />
            Settings
          </button>
        </div>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
          <header className="flex h-11 shrink-0 items-center gap-2 px-3">
            {!sidebarOpen ? (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-2 text-[#171616]/65 hover:bg-[#171616]/8"
                aria-label="Open sidebar"
              >
                <PanelLeft className="size-4" />
              </button>
            ) : null}
            <h1
              className={cn(
                "min-w-0 flex-1 truncate pl-1 text-[17px] font-semibold leading-none text-[#171616]",
                !sidebarOpen && "translate-y-0.5",
              )}
            >
              Claire
            </h1>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              className={cn(
                "min-h-0 transition-[flex-grow,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                chatStarted ? "flex-1 overflow-y-auto" : "h-0 flex-grow-0 overflow-hidden opacity-0",
              )}
              aria-hidden={!chatStarted}
            >
              <div
                className={cn(
                  "mx-auto w-full px-4 pb-40 pt-8 sm:pt-10",
                  chatStarted ? "max-w-6xl" : "max-w-3xl",
                )}
              >
                <div className="space-y-10">
                  {messages.map((m, i) =>
                    m.role === "user" ? (
                      <div key={i} className="flex w-full justify-end">
                        <div className="w-full rounded-3xl border border-[#171616]/10 bg-white/80 px-4 py-2.5 text-left text-[17px] leading-[1.75] tracking-[0.0125em] text-[#171616] shadow-sm backdrop-blur-sm">
                          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</p>
                        </div>
                      </div>
                    ) : (
                      <article
                        key={i}
                        className={cn(
                          "min-w-0",
                          sourcesSplitOpen && "grid gap-8 border-b border-[#171616]/08 pb-10 last:border-b-0 md:grid-cols-2 md:gap-10 md:border-b-0 md:pb-0",
                        )}
                      >
                        <div className="min-w-0 w-full">
                          <AssistantMarkdown content={m.content} />
                          <div className="mt-3 text-xs text-[#171616]/48">{m.duration ? m.duration : null}</div>
                          {m.preference_notification ? (
                            <div className="mt-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs text-amber-900">
                              <span className="font-medium">Preference learned: </span>
                              {m.preference_notification}
                            </div>
                          ) : null}
                        </div>
                        {sourcesSplitOpen ? (
                          <aside className="min-w-0 md:border-l md:border-[#171616]/10 md:pl-8">
                            <VerbatimSourcesColumn steps={m.pipeline_steps} />
                          </aside>
                        ) : null}
                      </article>
                    ),
                  )}
                </div>

                {loading ? (
                  <div className="mt-10 flex items-center gap-1.5 pl-0.5" aria-live="polite">
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-[#171616]/40 [animation-delay:-0.2s]" />
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-[#171616]/40 [animation-delay:-0.1s]" />
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-[#171616]/40" />
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
                ) : null}

                <div ref={bottomRef} className="h-1" />
              </div>
            </div>

            <div
              className={cn(
                "pointer-events-none absolute left-0 right-0 z-20 flex flex-col items-center px-4 transition-[top,bottom,transform,padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                chatStarted
                  ? "bottom-0 top-auto translate-y-0 bg-none pb-3 pt-12"
                  : "bottom-auto top-[44%] -translate-y-1/2 bg-none pb-4 pt-0",
              )}
            >
              <div className="pointer-events-auto flex w-full max-w-6xl flex-col items-center gap-3">
                {!chatStarted ? (
                  <div className="flex w-full flex-col items-stretch gap-3">
                    {error ? (
                      <div className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-800">
                        {error}
                      </div>
                    ) : null}
                    <h2 className="text-center text-[2rem] font-semibold tracking-[-0.025em] text-[#171616] sm:text-[2.375rem] md:text-[2.625rem]">
                      What can I do for you?
                    </h2>
                  </div>
                ) : null}
                <DemoComposer
                  draft={draft}
                  setDraft={setDraft}
                  loading={loading}
                  runSend={runSend}
                  showSuggestionHints={!chatStarted}
                  variant={chatStarted ? "chat" : "hero"}
                  filterSlot={composerFilter}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
