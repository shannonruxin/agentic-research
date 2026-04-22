import { describe, expect, it } from "vitest";
import { applyPriorReviewToAgent3Plan } from "@/lib/agents/agent3ResearchPlan";
import type { Agent3ResearchPlan, Agent3TaskResult } from "@/lib/types";

const basePlan: Agent3ResearchPlan = {
  plan_summary: "Test plan",
  agent6_assignment: {
    search_objective: "Find X",
    search_queries: ["old query a", "old query b"],
  },
};

const review: Agent3TaskResult = {
  sources_and_data: [],
  analysis_points: [],
  summary: "Need more on Y and Z",
  task_gaps: ["gap1"],
  assumptions: [],
  confidence: {
    score: 0.5,
    breakdown: {
      data_quality: 0.5,
      source_agreement: 0.5,
      assumption_strength: 0.5,
      method_fit: 0.5,
      coverage_completeness: 0.5,
    },
    reasoning: [],
  },
  needs_further_search: true,
  suggested_queries: ["new direction alpha", "new direction beta", "old query a"],
};

describe("applyPriorReviewToAgent3Plan", () => {
  it("prepends review suggested_queries and dedupes, preserving new direction first", () => {
    const out = applyPriorReviewToAgent3Plan(basePlan, review);
    expect(out.agent6_assignment.search_queries[0]).toBe("new direction alpha");
    expect(out.agent6_assignment.search_queries[1]).toBe("new direction beta");
    expect(out.agent6_assignment.search_queries).toContain("old query b");
    expect(out.agent6_assignment.search_queries).toEqual([
      "new direction alpha",
      "new direction beta",
      "old query a",
      "old query b",
    ]);
  });

  it("leaves the plan unchanged when the review has no suggested_queries or task_gaps", () => {
    const empty: Agent3TaskResult = {
      ...review,
      suggested_queries: [],
      task_gaps: [],
    };
    const out = applyPriorReviewToAgent3Plan(basePlan, empty);
    expect(out).toEqual(basePlan);
  });

  it("uses task_gaps as queries when suggested_queries is empty", () => {
    const gapped: Agent3TaskResult = {
      ...review,
      suggested_queries: [],
      task_gaps: ["gap query one"],
    };
    const out = applyPriorReviewToAgent3Plan(basePlan, gapped);
    expect(out.agent6_assignment.search_queries[0]).toBe("gap query one");
  });

  it("appends a follow-up line to the objective when not already present", () => {
    const out = applyPriorReviewToAgent3Plan(basePlan, review);
    expect(out.agent6_assignment.search_objective).toContain("Follow-up from Agent 3 review (prioritize):");
  });
});
