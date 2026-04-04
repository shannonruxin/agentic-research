/**
 * Requirement 2: Query Decomposition — requirements.md (Acceptance Criteria 1–5)
 * Maps each AC to automated checks where feasible; documents limits where not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateObject } from "ai";
import {
  decomposeQuery,
  QueryDecompositionModelError,
  QUERY_DECOMPOSITION_SYSTEM_PROMPT,
} from "@/lib/agents/queryDecomposition";
import type { QueryDecomposition } from "@/lib/types";

vi.mock("@/lib/bedrockModel", () => ({
  createBedrockLanguageModel: vi.fn(() => ({})),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateObject: vi.fn(),
  };
});

const mockGenerateObject = vi.mocked(generateObject);

describe("Requirement 2: Query Decomposition (requirements.md)", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

  const validModelObject = () => ({
    kind: "success" as const,
    core_query: "Does moderate exercise affect blood pressure?",
    keywords: ["exercise", "blood pressure", "cardiovascular"],
    support_angles: [
      { id: "angle_1", label: "RCTs", description: "Randomized trial evidence" },
      { id: "angle_2", label: "meta-analysis", description: "Pooled estimates" },
    ],
  });

  const validDecomposition = (): QueryDecomposition => {
    const o = validModelObject();
    const { kind: _k, ...rest } = o;
    return rest;
  };

  it("AC1: structured output includes core_query, keywords, and support_angles", async () => {
    const obj = validDecomposition();
    mockGenerateObject.mockResolvedValue({ object: { ...obj, kind: "success" as const } } as never);

    const out = await decomposeQuery("Exercise helps the heart.");

    expect(out).toHaveProperty("core_query");
    expect(out).toHaveProperty("keywords");
    expect(out).toHaveProperty("support_angles");
    expect(Array.isArray(out.keywords)).toBe(true);
    expect(Array.isArray(out.support_angles)).toBe(true);
  });

  it("AC2: support_angles has between 2 and 6 entries with distinct ids", async () => {
    const obj = validDecomposition();
    mockGenerateObject.mockResolvedValue({ object: { ...obj, kind: "success" as const } } as never);
    const out = await decomposeQuery("test input");

    expect(out.support_angles.length).toBeGreaterThanOrEqual(2);
    expect(out.support_angles.length).toBeLessThanOrEqual(6);
    const ids = out.support_angles.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("AC3: agent instructions require Query Decomposition agent, core query, keywords, angles (prompt contract)", () => {
    expect(QUERY_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/Query Decomposition Agent/i);
    expect(QUERY_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/neutral core query|core_query/i);
    expect(QUERY_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/NORMALIZATION RULES/i);
    expect(QUERY_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/Is smoking harmful to human health/i);
    expect(QUERY_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/investigation angles/i);
    expect(QUERY_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/keywords/i);
    expect(QUERY_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/support_angles|research direction/i);
  });

  it("AC4: no web browsing — generateObject is invoked without tools", async () => {
    mockGenerateObject.mockResolvedValue({ object: validModelObject() } as never);
    await decomposeQuery("Any non-empty text for AC4.");

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const call = mockGenerateObject.mock.calls[0]![0]!;
    expect(call).not.toHaveProperty("tools");
    expect(QUERY_DECOMPOSITION_SYSTEM_PROMPT).toMatch(
      /external knowledge|citations|web results|browse|retrieve urls/i,
    );
  });

  it("AC5: invalid structured output path surfaces error for pipeline halt", async () => {
    mockGenerateObject.mockRejectedValue(new Error("structured output failed"));

    await expect(decomposeQuery("Non-empty.")).rejects.toBeInstanceOf(QueryDecompositionModelError);
  });
});
