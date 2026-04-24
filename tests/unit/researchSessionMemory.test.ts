import { describe, expect, it } from "vitest";
import { buildCompactResearchMemoryForAgent7Prompt } from "@/lib/researchSessionMemory";

describe("buildCompactResearchMemoryForAgent7Prompt", () => {
  it("strips full agent36 blobs and keeps a compact final_agent3_result", () => {
    const fullLoop = {
      final_agent3_result: {
        plan_summary: "p".repeat(2000),
        summary: "S",
        confidence: { score: 0.5 },
        sources_and_data: Array.from({ length: 10 }, (_, i) => ({
          url: `https://x.com/${i}`,
          relevance: "r",
          data_noted: "d",
        })),
        analysis_points: Array.from({ length: 20 }, (_, i) => `a${i}`),
      },
      agent6_runs: [{ huge: true }],
      research_log: [{ huge: true }],
      iterations: 2,
      stopped_reason: "sufficient" as const,
    };
    const raw = JSON.stringify({
      "1": {
        question: "q1",
        "user-output": {
          summary: { k: 1 },
          document: "long doc",
          agent36_1_iter1: fullLoop,
        },
      },
    });
    const compact = buildCompactResearchMemoryForAgent7Prompt(raw, { maxTurnsInFullDetail: 3 });
    expect(compact).not.toContain("agent6_runs");
    expect(compact).not.toContain("research_log");
    expect(compact).toContain("stopped_reason");
    const parsed = JSON.parse(compact) as Record<string, unknown>;
    const uo = (parsed["1"] as { "user-output": Record<string, unknown> })["user-output"];
    const fl = uo["agent36_1_iter1"] as { final_agent3_result: { plan_summary: string; sources_and_data: unknown[] } };
    expect(fl.final_agent3_result.plan_summary.length).toBeLessThan(900);
    expect((fl.final_agent3_result.sources_and_data as unknown[]).length).toBe(5);
  });

  it("keeps only summary for older turns when many chrono keys exist", () => {
    const turn = (n: string) => ({
      question: "q",
      "user-output": {
        summary: { n },
        document: "d",
        agent7_iter1: { orchestration: "deliver_to_user", train_of_thought: "long".repeat(100) },
      },
    });
    const raw = JSON.stringify({
      "1": turn("1"),
      "2": turn("2"),
      "3": turn("3"),
      "4": turn("4"),
      "5": turn("5"),
    });
    const compact = buildCompactResearchMemoryForAgent7Prompt(raw, { maxTurnsInFullDetail: 2, minOlderTurnsForSummaryOnly: 2 });
    const p = JSON.parse(compact) as Record<string, unknown>;
    const t1 = p["1"] as { "user-output": { agent7_iter1?: unknown; summary?: { n: string } } };
    expect(t1["user-output"].agent7_iter1).toBeUndefined();
    expect(t1["user-output"].summary).toBeDefined();
    const t5 = p["5"] as { "user-output": { agent7_iter1?: { orchestration: string } } };
    expect(t5["user-output"].agent7_iter1).toBeDefined();
  });
});
