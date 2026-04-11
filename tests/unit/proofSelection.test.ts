import { describe, expect, it } from "vitest";
import { buildProofAnswerFromSelection } from "@/lib/proofSelection";

describe("buildProofAnswerFromSelection", () => {
  const full = {
    answer_text: "First line.\nSecond line with claim.",
    declared_sources: [{ url: "https://example.com", title: "Ex" }],
  };

  it("builds synthetic answer with same declared_sources", () => {
    const r = buildProofAnswerFromSelection(full, "Second line");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.synthetic.answer_text).toBe("Second line");
      expect(r.synthetic.declared_sources).toEqual(full.declared_sources);
    }
  });

  it("rejects when selection is not in answer", () => {
    const r = buildProofAnswerFromSelection(full, "not present");
    expect(r.ok).toBe(false);
  });

  it("rejects empty selection", () => {
    const r = buildProofAnswerFromSelection(full, "   ");
    expect(r.ok).toBe(false);
  });
});
