"use client";

import { X } from "lucide-react";
import { useState } from "react";
import {
  PARALLEL_SOURCE_POLICY_MAX_DOMAINS,
  normalizeDomainForPolicy,
} from "@/lib/parallelSourcePolicy";
import { cn } from "@/lib/utils";

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
  /** Claire / demo shell — matches DemoChatView palette */
  visualTheme?: "default" | "demo";
};

function DomainBadgeRow({
  domains,
  onRemove,
  ariaLabel = "Source list",
  visualTheme = "default",
}: {
  domains: string[];
  onRemove: (d: string) => void;
  ariaLabel?: string;
  visualTheme?: "default" | "demo";
}) {
  const isDemo = visualTheme === "demo";
  if (domains.length === 0) {
    return null;
  }
  return (
    <ul className="flex min-h-[1.5rem] flex-wrap gap-1.5" aria-label={ariaLabel}>
      {domains.map((d) => (
        <li key={d}>
          <span
            className={cn(
              "inline-flex max-w-full items-center gap-0.5 rounded-full pl-2 pr-0.5 text-xs font-medium shadow-sm",
              isDemo
                ? "border border-[#171616]/14 bg-white text-[#171616]"
                : "border border-zinc-300/80 bg-white text-zinc-800",
            )}
          >
            <span className="truncate">{d}</span>
            <button
              type="button"
              className={cn(
                "shrink-0 rounded-full p-1",
                isDemo
                  ? "text-[#171616]/55 hover:bg-[#171616]/8 hover:text-[#171616]"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
              )}
              onClick={() => onRemove(d)}
              aria-label={`Remove source ${d}`}
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
  visualTheme = "default",
}: ParallelSourcePolicyBarProps) {
  const [excludeDraft, setExcludeDraft] = useState("");
  const [includeDraft, setIncludeDraft] = useState("");
  const isDemo = visualTheme === "demo";

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

  const titleCls = cn("text-xs font-semibold", isDemo ? "text-[#171616]" : "text-zinc-800");
  const labelCls = cn("font-medium text-xs", isDemo ? "text-[#171616]" : "text-zinc-700");
  const inputCls = cn(
    "w-full rounded-md px-2 py-1.5",
    isDemo
      ? "border border-[#171616]/18 bg-white text-[#171616] placeholder:text-[#171616]/35 disabled:bg-[#171616]/5"
      : "border border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 disabled:bg-zinc-100",
  );

  return (
    <section
      aria-label="Filters"
      className={cn(
        "w-full space-y-4 px-3 py-2 text-xs sm:text-[13px]",
        isDemo
          ? "rounded-xl border border-[#171616]/12 bg-white/85 text-[#171616] backdrop-blur-sm"
          : "rounded-lg border border-zinc-200/90 bg-white text-zinc-800 shadow-sm",
      )}
    >
      <div className="space-y-2">
        <h3 className={titleCls}>Excluded sources</h3>
        <DomainBadgeRow
          domains={excludedDomains}
          onRemove={(d) => onExcludedDomainsChange(excludedDomains.filter((x) => x !== d))}
          ariaLabel="Excluded sources"
          visualTheme={visualTheme}
        />
        <input
          type="text"
          className={inputCls}
          placeholder={excludeAtCap ? "Max" : ""}
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

      <div className={cn("space-y-2 border-t pt-4", isDemo ? "border-[#171616]/10" : "border-zinc-200")}>
        <h3 className={titleCls}>Prioritized sources</h3>
        <label
          className={cn("flex cursor-pointer items-center gap-2", isDemo ? "text-[#171616]" : "text-zinc-800")}
        >
          <input
            type="checkbox"
            className={cn(
              "size-3.5 shrink-0 rounded border-zinc-400",
              isDemo ? "accent-[#3d6b47]" : "accent-zinc-900",
            )}
            checked={onlyUseIncludedDomains}
            onChange={(e) => onOnlyUseIncludedDomainsChange(e.target.checked)}
          />
          <span className="text-xs font-medium">Restrict to list</span>
        </label>
        <DomainBadgeRow
          domains={includedDomains}
          onRemove={(d) => onIncludedDomainsChange(includedDomains.filter((x) => x !== d))}
          ariaLabel="Prioritized sources"
          visualTheme={visualTheme}
        />
        <input
          type="text"
          className={inputCls}
          placeholder={includeAtCap ? "Max" : ""}
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

      <div className={cn("space-y-2 border-t pt-4", isDemo ? "border-[#171616]/10" : "border-zinc-200")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={labelCls}>Published after</span>
            <input
              type="date"
              className={cn(
                "w-full rounded-md px-2 py-1.5",
                isDemo
                  ? "border border-[#171616]/18 bg-white text-[#171616]"
                  : "border border-zinc-300 bg-white text-zinc-900",
              )}
              value={publishedAfter}
              onChange={(e) => onPublishedAfterChange(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelCls}>Published before</span>
            <input
              type="date"
              className={cn(
                "w-full rounded-md px-2 py-1.5",
                isDemo
                  ? "border border-[#171616]/18 bg-white text-[#171616]"
                  : "border border-zinc-300 bg-white text-zinc-900",
              )}
              value={publishedBefore}
              onChange={(e) => onPublishedBeforeChange(e.target.value)}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
