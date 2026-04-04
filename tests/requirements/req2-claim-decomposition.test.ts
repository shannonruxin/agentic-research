/**
 * Requirement 2: Claim Decomposition — requirements.md (Acceptance Criteria 1–5)
 * Maps each AC to automated checks where feasible; documents limits where not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateObject } from "ai";
import {
  decomposeClaim,
  ClaimDecompositionModelError,
  CLAIM_DECOMPOSITION_SYSTEM_PROMPT,
} from "@/lib/agents/claimDecomposition";
import type { ClaimDecomposition } from "@/lib/types";

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

describe("Requirement 2: Claim Decomposition (requirements.md)", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

  const validDecomposition = (): ClaimDecomposition => ({
    core_claim: "Moderate exercise lowers blood pressure.",
    keywords: ["exercise", "blood pressure", "cardiovascular"],
    support_angles: [
      { id: "angle_1", label: "RCTs", description: "Randomized trial evidence" },
      { id: "angle_2", label: "meta-analysis", description: "Pooled estimates" },
    ],
  });

  it("AC1: structured output includes core_claim, keywords, and support_angles", async () => {
    const obj = validDecomposition();
    mockGenerateObject.mockResolvedValue({ object: obj } as never);

    const out = await decomposeClaim("Exercise helps the heart.");

    expect(out).toHaveProperty("core_claim");
    expect(out).toHaveProperty("keywords");
    expect(out).toHaveProperty("support_angles");
    expect(Array.isArray(out.keywords)).toBe(true);
    expect(Array.isArray(out.support_angles)).toBe(true);
  });

  it("AC2: support_angles has between 2 and 6 entries with distinct ids", async () => {
    const obj = validDecomposition();
    mockGenerateObject.mockResolvedValue({ object: obj } as never);
    const out = await decomposeClaim("test claim");

    expect(out.support_angles.length).toBeGreaterThanOrEqual(2);
    expect(out.support_angles.length).toBeLessThanOrEqual(6);
    const ids = out.support_angles.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("AC3: agent instructions require expanding keywords and support angles (prompt contract)", () => {
    expect(CLAIM_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/expand the conceptual meaning/i);
    expect(CLAIM_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/keywords/i);
    expect(CLAIM_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/support_angles|distinct evidence perspectives/i);
    // Full semantic expansion is model-dependent; this locks the intended prompt behavior.
  });

  it("AC4: no web browsing — generateObject is invoked without tools", async () => {
    mockGenerateObject.mockResolvedValue({ object: validDecomposition() } as never);
    await decomposeClaim("Any non-empty claim for AC4.");

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const call = mockGenerateObject.mock.calls[0]![0]!;
    expect(call).not.toHaveProperty("tools");
    expect(CLAIM_DECOMPOSITION_SYSTEM_PROMPT).toMatch(/do not browse|retrieve urls|cite sources/i);
  });

  it("AC5: invalid structured output path surfaces error for pipeline halt", async () => {
    mockGenerateObject.mockRejectedValue(new Error("structured output failed"));

    await expect(decomposeClaim("Non-empty.")).rejects.toBeInstanceOf(ClaimDecompositionModelError);
  });
});
