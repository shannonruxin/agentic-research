import { describe, expect, it } from "vitest";
import { normalizeDimensionId, resolveResearchTaskDimensionId } from "@/lib/dimensionId";

describe("dimensionId", () => {
  it("slugifies labels", () => {
    expect(normalizeDimensionId("Company Archetypes!")).toBe("company-archetypes");
  });

  it("resolves task dimension to canonical id", () => {
    const dims = [
      { id: "market-size", label: "Market Size" },
      { id: "competition", label: "Competitive Dynamics" },
    ];
    expect(resolveResearchTaskDimensionId("market-size", dims)).toBe("market-size");
    expect(resolveResearchTaskDimensionId("Market Size", dims)).toBe("market-size");
    expect(resolveResearchTaskDimensionId("competitive dynamics", dims)).toBe("competition");
  });
});
