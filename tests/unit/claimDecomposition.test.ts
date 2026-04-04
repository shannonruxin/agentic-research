import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateObject } from "ai";
import {
  decomposeClaim,
  EmptyClaimError,
  ClaimDecompositionModelError,
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

describe("decomposeClaim", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

  it("empty input throws EmptyClaimError before generateObject (Req 1.4)", async () => {
    await expect(decomposeClaim("")).rejects.toBeInstanceOf(EmptyClaimError);
    await expect(decomposeClaim("   \n\t  ")).rejects.toBeInstanceOf(EmptyClaimError);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("paragraph input: returns structured output from model (Req 1.2)", async () => {
    const mockOut: ClaimDecomposition = {
      core_claim: "Coffee consumption correlates with reduced stroke risk.",
      keywords: ["coffee", "stroke", "epidemiology"],
      support_angles: [
        {
          id: "angle_1",
          label: "cohort studies",
          description: "Longitudinal population evidence",
        },
        {
          id: "angle_2",
          label: "meta-analysis",
          description: "Pooled effect estimates",
        },
      ],
    };
    mockGenerateObject.mockResolvedValue({ object: mockOut } as never);

    const paragraph =
      "Several large cohort studies suggest that moderate coffee intake may be associated with lower stroke risk. " +
      "Researchers adjusted for smoking and BMI. The relationship remains debated.";

    const result = await decomposeClaim(paragraph);
    expect(result).toEqual(mockOut);
    expect(result.core_claim.length).toBeGreaterThan(0);
    expect(result.support_angles.length).toBeGreaterThanOrEqual(2);
  });

  it("single atomic claim passed through as core_claim via model output (Req 1.3)", async () => {
    const atomic = "The speed of light in vacuum is constant.";
    const mockOut: ClaimDecomposition = {
      core_claim: atomic,
      keywords: ["light", "physics"],
      support_angles: [
        { id: "a1", label: "measurements", description: "Experimental values" },
        { id: "a2", label: "theory", description: "Relativity framework" },
      ],
    };
    mockGenerateObject.mockResolvedValue({ object: mockOut } as never);

    const result = await decomposeClaim(atomic);
    expect(result.core_claim).toBe(atomic);
  });

  it("generateObject failure becomes ClaimDecompositionModelError (Req 2.5)", async () => {
    mockGenerateObject.mockRejectedValue(new Error("model exploded"));

    await expect(decomposeClaim("Some non-empty claim.")).rejects.toBeInstanceOf(
      ClaimDecompositionModelError,
    );
  });
});
