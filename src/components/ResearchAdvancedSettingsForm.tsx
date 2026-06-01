"use client";

import type { ResearchChatController } from "@/hooks/useResearchChat";

export function ResearchAdvancedSettingsForm({ chat }: { chat: ResearchChatController }) {
  const {
    subjectScopeText,
    setSubjectScopeText,
    memoryText,
    setMemoryText,
    knownGapsText,
    setKnownGapsText,
    dimensionsText,
    setDimensionsText,
    keyFindingsText,
    setKeyFindingsText,
    sessionPreferences,
    maxRounds,
    setMaxRounds,
    maxWorkersConcurrent,
    setMaxWorkersConcurrent,
    workerStaggerMs,
    setWorkerStaggerMs,
    maxWorkerSteps,
    setMaxWorkerSteps,
    maxTasksPerRound,
    setMaxTasksPerRound,
    orchestratorTemp,
    setOrchestratorTemp,
    workerTemp,
    setWorkerTemp,
    deliverMaxTokens,
    setDeliverMaxTokens,
  } = chat;

  return (
    <div className="space-y-2 text-xs">
      <p className="text-zinc-600">
        Domain context is read from{" "}
        <code className="rounded bg-zinc-100 px-0.5">workspace/global/domain-manuals/domain-manual.json</code>. User
        preferences are learned automatically and stored there too.
      </p>
      <label className="block font-medium text-zinc-800">subject_scope (optional)</label>
      <textarea
        className="h-20 w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-sm"
        value={subjectScopeText}
        onChange={(e) => setSubjectScopeText(e.target.value)}
        placeholder='e.g. "Subject: humeo.com only. Out: Hume AI, Humeo Poland."'
      />
      <label className="block font-medium text-zinc-800">memory (JSON object, optional)</label>
      <textarea
        className="h-16 w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-mono"
        value={memoryText}
        onChange={(e) => setMemoryText(e.target.value)}
      />
      <label className="block font-medium text-zinc-800">key_findings (auto-updated; optional override)</label>
      <textarea
        className="h-20 w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-mono"
        value={keyFindingsText}
        onChange={(e) => setKeyFindingsText(e.target.value)}
      />
      <label className="block font-medium text-zinc-800">dimensions (JSON array, optional)</label>
      <textarea
        className="h-16 w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-mono"
        value={dimensionsText}
        onChange={(e) => setDimensionsText(e.target.value)}
      />
      <label className="block font-medium text-zinc-800">known_gaps_seed (JSON array, optional)</label>
      <textarea
        className="h-16 w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-mono"
        value={knownGapsText}
        onChange={(e) => setKnownGapsText(e.target.value)}
      />
      <p className="font-semibold text-zinc-800">Pipeline</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-zinc-600">
          max_rounds
          <input
            type="text"
            inputMode="numeric"
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono"
            value={maxRounds}
            onChange={(e) => setMaxRounds(e.target.value)}
          />
        </label>
        <label className="text-zinc-600">
          max_workers
          <input
            type="text"
            inputMode="numeric"
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono"
            value={maxWorkersConcurrent}
            onChange={(e) => setMaxWorkersConcurrent(e.target.value)}
          />
        </label>
        <label className="text-zinc-600">
          stagger_ms
          <input
            type="text"
            inputMode="numeric"
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono"
            value={workerStaggerMs}
            onChange={(e) => setWorkerStaggerMs(e.target.value)}
          />
        </label>
        <label className="text-zinc-600">
          worker_steps
          <input
            type="text"
            inputMode="numeric"
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono"
            value={maxWorkerSteps}
            onChange={(e) => setMaxWorkerSteps(e.target.value)}
          />
        </label>
        <label className="text-zinc-600">
          tasks/round
          <input
            type="text"
            inputMode="numeric"
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono"
            value={maxTasksPerRound}
            onChange={(e) => setMaxTasksPerRound(e.target.value)}
          />
        </label>
        <label className="text-zinc-600">
          orch_temp
          <input
            type="text"
            inputMode="decimal"
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono"
            value={orchestratorTemp}
            onChange={(e) => setOrchestratorTemp(e.target.value)}
          />
        </label>
        <label className="text-zinc-600">
          worker_temp
          <input
            type="text"
            inputMode="decimal"
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono"
            value={workerTemp}
            onChange={(e) => setWorkerTemp(e.target.value)}
          />
        </label>
        <label className="text-zinc-600">
          deliver_tokens
          <input
            type="text"
            inputMode="numeric"
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-zinc-50 p-1.5 font-mono"
            value={deliverMaxTokens}
            onChange={(e) => setDeliverMaxTokens(e.target.value)}
          />
        </label>
      </div>
      {sessionPreferences.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2">
          <p className="font-medium text-amber-800">Session preferences (learned this chat):</p>
          {sessionPreferences.map((sp, i) => (
            <p key={i} className="text-amber-800">
              • {sp.rule}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
