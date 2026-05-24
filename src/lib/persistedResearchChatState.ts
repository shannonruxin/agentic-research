import type { Agent7Dimension, Agent7KnownGapGroup, ParallelPipelineStep } from "@/lib/types";

/** Serializable research / demo chat session (matches `useResearchChat` fields). */
export type PersistedChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      preference_notification?: string;
      duration?: string;
      pipeline_steps?: ParallelPipelineStep[];
    };

/** @deprecated Use `PersistedChatMessage` */
export type PersistedResearchChatMessage = PersistedChatMessage;

export type PersistedResearchChatState = {
  messages: PersistedChatMessage[];
  draft: string;
  subjectScopeText: string;
  researchHygieneText: string;
  memoryText: string;
  knownGapsText: string;
  dimensionsText: string;
  keyFindingsText: string;
  keyFindingsSeed: Record<string, unknown> | undefined;
  dimensionsSeed: Agent7Dimension[] | undefined;
  knownGapsSeed: Agent7KnownGapGroup[] | undefined;
  sessionPreferences: { rule: string; source: string; added: string }[];
  maxRounds: string;
  maxWorkersConcurrent: string;
  workerStaggerMs: string;
  maxWorkerSteps: string;
  maxTasksPerRound: string;
  orchestratorTemp: string;
  workerTemp: string;
  deliverMaxTokens: string;
};

export type TempChatHistoryFileV1 = {
  version: 1;
  id: string;
  savedAt: string;
  title: string;
  state: PersistedResearchChatState;
};

export type TempChatHistoryListItemV1 = {
  id: string;
  title: string;
  savedAt: string;
};
