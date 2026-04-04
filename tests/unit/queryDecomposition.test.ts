import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateObject } from "ai";
import {
  decomposeQuery,
  EmptyQueryError,
  NoValidQueryError,
  QueryDecompositionModelError,
} from "@/lib/agents/queryDecomposition";

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

describe("decomposeQuery", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

  it("empty input throws EmptyQueryError before generateObject (Req 1.4)", async () => {
    await expect(decomposeQuery("")).rejects.toBeInstanceOf(EmptyQueryError);
    await expect(decomposeQuery("   \n\t  ")).rejects.toBeInstanceOf(EmptyQueryError);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("paragraph input: returns structured output from model (Req 1.2)", async () => {
    const mockOut = {
      kind: "success" as const,
      core_query: "Does coffee consumption correlate with stroke risk?",
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

    const result = await decomposeQuery(paragraph);
    expect(result).toEqual({
      core_query: mockOut.core_query,
      keywords: mockOut.keywords,
      support_angles: mockOut.support_angles,
    });
    expect(result.core_query.length).toBeGreaterThan(0);
    expect(result.support_angles.length).toBeGreaterThanOrEqual(2);
  });

  it("single-input normalized to core_query via model output (Req 1.3)", async () => {
    const atomic = "The speed of light in vacuum is constant.";
    const mockOut = {
      kind: "success" as const,
      core_query: "Is the speed of light in vacuum constant?",
      keywords: ["light", "physics"],
      support_angles: [
        { id: "a1", label: "measurements", description: "Experimental values" },
        { id: "a2", label: "theory", description: "Relativity framework" },
      ],
    };
    mockGenerateObject.mockResolvedValue({ object: mockOut } as never);

    const result = await decomposeQuery(atomic);
    expect(result.core_query).toBe(mockOut.core_query);
  });

  it("generateObject failure becomes QueryDecompositionModelError (Req 2.5)", async () => {
    mockGenerateObject.mockRejectedValue(new Error("model exploded"));

    await expect(decomposeQuery("Some non-empty text.")).rejects.toBeInstanceOf(
      QueryDecompositionModelError,
    );
  });

  it("model invalid_input becomes NoValidQueryError", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { kind: "invalid_input", error_message: "No proposition in input." },
    } as never);

    await expect(decomposeQuery("lorem ipsum only.")).rejects.toBeInstanceOf(NoValidQueryError);
  });
});
