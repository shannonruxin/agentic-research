import type { AIAnswerOutput } from "@/lib/types";

export function buildProofAnswerFromSelection(
  full: AIAnswerOutput,
  rawSelection: string,
): { ok: true; synthetic: AIAnswerOutput } | { ok: false; error: string } {
  const trimmed = rawSelection.trim();
  if (!trimmed) {
    return { ok: false, error: "Select text from the answer, then tap Proof." };
  }
  if (!full.answer_text.includes(trimmed)) {
    return {
      ok: false,
      error:
        "That selection doesn’t match the answer text. Try selecting inside the answer paragraph again.",
    };
  }
  return {
    ok: true,
    synthetic: {
      answer_text: trimmed,
      declared_sources: full.declared_sources,
    },
  };
}
