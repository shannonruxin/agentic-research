import { describe, expect, it } from "vitest";
import { resolveVerbatimQuoteInAnswer } from "@/lib/agents/agent3Evidence";

describe("resolveVerbatimQuoteInAnswer", () => {
  it("returns exact span for direct match", () => {
    const a = "Alpha beta gamma.";
    expect(resolveVerbatimQuoteInAnswer(a, "beta")).toBe("beta");
  });

  it("accepts trimmed quote when answer has no outer spaces", () => {
    const a = "Alpha beta gamma.";
    expect(resolveVerbatimQuoteInAnswer(a, "  beta  ")).toBe("beta");
  });

  it("maps NBSP in quote to space in answer", () => {
    const a = "Cost is $5 per unit.";
    const quoteWithNbsp = "Cost is $5\u00a0per unit.";
    expect(resolveVerbatimQuoteInAnswer(a, quoteWithNbsp)).toBe("Cost is $5 per unit.");
  });
});
