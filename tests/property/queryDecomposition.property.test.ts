import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { generateObject } from "ai";
import { decomposeQuery } from "@/lib/agents/queryDecomposition";

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

// Feature: query-evidence-retrieval — Agent 1 structured output invariants (mocked LLM)

/** Avoid whitespace-only strings (decomposeQuery trims input). */
const nonWhitespaceText = (min: number, max: number) =>
  fc.string({ minLength: min, maxLength: max }).filter((s) => s.trim().length > 0);

const supportAngleArb = fc.record({
  id: nonWhitespaceText(1, 32),
  label: nonWhitespaceText(1, 64),
  description: nonWhitespaceText(1, 200),
});

const uniqueSupportAnglesArb = fc
  .array(supportAngleArb, { minLength: 2, maxLength: 6 })
  .filter((angles) => new Set(angles.map((a) => a.id)).size === angles.length);

const decompositionArb = fc.record({
  kind: fc.constant("success" as const),
  core_query: nonWhitespaceText(1, 300),
  keywords: fc.array(nonWhitespaceText(1, 40), { minLength: 1, maxLength: 12 }),
  support_angles: uniqueSupportAnglesArb,
});

describe("Query decomposition properties (mocked generateObject)", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

  // Property 1: Decomposition output schema (Req 2.1)
  it("any non-empty input yields non-empty core_query, keywords, and support_angles", () => {
    return fc.assert(
      fc.asyncProperty(
        nonWhitespaceText(1, 500),
        decompositionArb,
        async (userText, decomp) => {
          mockGenerateObject.mockResolvedValueOnce({ object: decomp } as never);
          const out = await decomposeQuery(userText);
          expect(out.core_query.length).toBeGreaterThan(0);
          expect(out.keywords.length).toBeGreaterThan(0);
          expect(out.support_angles.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 2: Support angles count invariant (Req 2.2)
  it("support_angles length is always between 2 and 6 when model returns schema-conformant output", () => {
    return fc.assert(
      fc.asyncProperty(
        nonWhitespaceText(1, 200),
        decompositionArb,
        async (userText, decomp) => {
          mockGenerateObject.mockResolvedValueOnce({ object: decomp } as never);
          const out = await decomposeQuery(userText);
          expect(out.support_angles.length).toBeGreaterThanOrEqual(2);
          expect(out.support_angles.length).toBeLessThanOrEqual(6);
        },
      ),
      { numRuns: 100 },
    );
  });
});
