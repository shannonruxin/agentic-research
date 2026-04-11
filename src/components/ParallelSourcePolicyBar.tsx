"use client";

import { X } from "lucide-react";
import { useState } from "react";
import {
  PARALLEL_SOURCE_POLICY_MAX_DOMAINS,
  normalizeDomainForPolicy,
} from "@/lib/parallelSourcePolicy";

const DOCS_URL = "https://docs.parallel.ai/resources/source-policy";

export type ParallelSourcePolicyBarProps = {
  excludedDomains: string[];
  includedDomains: string[];
  onExcludedDomainsChange: (domains: string[]) => void;
  onIncludedDomainsChange: (domains: string[]) => void;
  publishedAfter: string;
  onPublishedAfterChange: (value: string) => void;
  publishedBefore: string;
  onPublishedBeforeChange: (value: string) => void;
  /** When true, `includeDomains` is sent to Parallel (restrict to Prioritized Domains only). */
  onlyUseIncludedDomains: boolean;
  onOnlyUseIncludedDomainsChange: (value: boolean) => void;
};

function DomainBadgeRow({
  domains,
  onRemove,
  emptyLabel,
  ariaLabel = "Domain list",
}: {
  domains: string[];
  onRemove: (d: string) => void;
  emptyLabel: string;
  ariaLabel?: string;
}) {
  if (domains.length === 0) {
    return (
      <p className="min-h-[1.5rem] text-xs italic text-zinc-400" aria-live="polite">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="flex min-h-[1.5rem] flex-wrap gap-1.5" aria-label={ariaLabel}>
      {domains.map((d) => (
        <li key={d}>
          <span className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-zinc-300/80 bg-white pl-2 pr-0.5 text-xs font-medium text-zinc-800 shadow-sm">
            <span className="truncate">{d}</span>
            <button
              type="button"
              className="shrink-0 rounded-full p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              onClick={() => onRemove(d)}
              aria-label={`Remove ${d}`}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ParallelSourcePolicyBar({
  excludedDomains,
  includedDomains,
  onExcludedDomainsChange,
  onIncludedDomainsChange,
  publishedAfter,
  onPublishedAfterChange,
  publishedBefore,
  onPublishedBeforeChange,
  onlyUseIncludedDomains,
  onOnlyUseIncludedDomainsChange,
}: ParallelSourcePolicyBarProps) {
  const [excludeDraft, setExcludeDraft] = useState("");
  const [includeDraft, setIncludeDraft] = useState("");

  const excludeAtCap = excludedDomains.length >= PARALLEL_SOURCE_POLICY_MAX_DOMAINS;
  const includeAtCap = includedDomains.length >= PARALLEL_SOURCE_POLICY_MAX_DOMAINS;

  function addExcluded() {
    const raw = excludeDraft;
    setExcludeDraft("");
    if (!raw.trim()) return;
    if (excludedDomains.length >= PARALLEL_SOURCE_POLICY_MAX_DOMAINS) return;
    const candidates = [
      ...new Set(
        raw
          .split(/[,\n]+/)
          .map((s) => normalizeDomainForPolicy(s))
          .filter((d): d is string => d !== null),
      ),
    ];
    const next = [...excludedDomains];
    for (const d of candidates) {
      if (next.length >= PARALLEL_SOURCE_POLICY_MAX_DOMAINS) break;
      if (!next.includes(d)) next.push(d);
    }
    onIncludedDomainsChange(includedDomains.filter((x) => !next.includes(x)));
    onExcludedDomainsChange(next);
  }

  function addIncluded() {
    const raw = includeDraft;
    setIncludeDraft("");
    if (!raw.trim()) return;
    if (includedDomains.length >= PARALLEL_SOURCE_POLICY_MAX_DOMAINS) return;
    const candidates = [
      ...new Set(
        raw
          .split(/[,\n]+/)
          .map((s) => normalizeDomainForPolicy(s))
          .filter((d): d is string => d !== null),
      ),
    ];
    const next = [...includedDomains];
    for (const d of candidates) {
      if (next.length >= PARALLEL_SOURCE_POLICY_MAX_DOMAINS) break;
      if (!next.includes(d)) next.push(d);
    }
    onExcludedDomainsChange(excludedDomains.filter((x) => !next.includes(x)));
    onIncludedDomainsChange(next);
  }

  return (
    <section
      aria-label="Parallel search source policy"
      className="w-full rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-zinc-800 shadow-sm sm:text-[13px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-2">
        <span className="font-semibold text-zinc-900">Parallel search — trusted sources</span>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-amber-900/90 underline decoration-amber-700/50 underline-offset-2 hover:text-amber-950"
        >
          Source policy docs
        </a>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-zinc-600 sm:text-xs">
        Type a domain and press <kbd className="rounded border border-zinc-300 bg-white px-1">Enter</kbd> to
        add. Parallel allows up to {PARALLEL_SOURCE_POLICY_MAX_DOMAINS} domains per list (
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-amber-900/90 underline decoration-amber-700/40 underline-offset-2"
        >
          source policy
        </a>
        ). Excluded and Prioritized lists can be used together; adding a domain to one list removes it from the
        other.
      </p>

      <div className="mt-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Excluded domains</h3>
        <DomainBadgeRow
          domains={excludedDomains}
          onRemove={(d) => onExcludedDomainsChange(excludedDomains.filter((x) => x !== d))}
          emptyLabel="None — add domains below"
          ariaLabel="Excluded domain list"
        />
        <input
          type="text"
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 placeholder:text-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-500"
          placeholder={
            excludeAtCap
              ? `Maximum ${PARALLEL_SOURCE_POLICY_MAX_DOMAINS} domains (Parallel limit)`
              : "e.g. wikipedia.org — press Enter"
          }
          value={excludeDraft}
          onChange={(e) => setExcludeDraft(e.target.value)}
          disabled={excludeAtCap}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addExcluded();
            }
          }}
        />
      </div>

      <div className="mt-4 space-y-2 border-t border-amber-200/50 pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Prioritized domains</h3>
          <label className="flex cursor-pointer items-start gap-2 text-xs font-medium text-zinc-800">
            <input
              type="checkbox"
              className="mt-0.5 size-3.5 shrink-0 rounded border-zinc-400 accent-zinc-900"
              checked={onlyUseIncludedDomains}
              onChange={(e) => onOnlyUseIncludedDomainsChange(e.target.checked)}
            />
            <span className="leading-snug">
              Only use sources included in{" "}
              <strong className="font-semibold text-zinc-900">Prioritized Domains</strong>
            </span>
          </label>
        </div>
        <DomainBadgeRow
          domains={includedDomains}
          onRemove={(d) => onIncludedDomainsChange(includedDomains.filter((x) => x !== d))}
          emptyLabel="None — add domains you want preferred below"
          ariaLabel="Prioritized domain list"
        />
        <input
          type="text"
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 placeholder:text-zinc-400 disabled:bg-zinc-100"
          placeholder={
            includeAtCap
              ? `Maximum ${PARALLEL_SOURCE_POLICY_MAX_DOMAINS} domains (Parallel limit)`
              : "e.g. arxiv.org — press Enter"
          }
          value={includeDraft}
          onChange={(e) => setIncludeDraft(e.target.value)}
          disabled={includeAtCap}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addIncluded();
            }
          }}
        />
      </div>

      <div className="mt-4 space-y-2 border-t border-amber-200/50 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Date</h3>
        {!publishedAfter.trim() && !publishedBefore.trim() ? (
          <p className="min-h-[1.5rem] text-xs italic text-zinc-400" aria-live="polite">
            None — optional filters below
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="font-medium text-zinc-700">Published after (optional)</span>
            <input
              type="date"
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900"
              value={publishedAfter}
              onChange={(e) => onPublishedAfterChange(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="font-medium text-zinc-700">Published before (optional)</span>
            <input
              type="date"
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900"
              value={publishedBefore}
              onChange={(e) => onPublishedBeforeChange(e.target.value)}
            />
          </label>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">
        Server may still merge{" "}
        <code className="rounded bg-white/80 px-1">PARALLEL_SEARCH_*</code> env vars with these lists.
      </p>
    </section>
  );
}
