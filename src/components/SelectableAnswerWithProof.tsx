"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AIAnswerOutput } from "@/lib/types";
import { buildProofAnswerFromSelection } from "@/lib/proofSelection";

export type SelectableAnswerWithProofProps = {
  fullAnswer: AIAnswerOutput;
  /** Container around the answer text (scroll, border, padding). */
  className?: string;
  /** Classes for the paragraph that shows `answer_text`. */
  textClassName?: string;
  disabled?: boolean;
  proofBusy?: boolean;
  onProof: (synthetic: AIAnswerOutput) => void;
  onProofInvalid?: (message: string) => void;
};

/**
 * Renders `fullAnswer.answer_text` as selectable copy; shows a floating **Proof** control when the
 * selection is a verbatim substring of the answer.
 */
export function SelectableAnswerWithProof({
  fullAnswer,
  className,
  textClassName,
  disabled = false,
  proofBusy = false,
  onProof,
  onProofInvalid,
}: SelectableAnswerWithProofProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [floater, setFloater] = useState<{ left: number; top: number } | null>(null);
  const selectionTrimmedRef = useRef<string>("");

  const updateFloater = useCallback(() => {
    if (disabled || proofBusy) {
      setFloater(null);
      selectionTrimmedRef.current = "";
      return;
    }
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setFloater(null);
      selectionTrimmedRef.current = "";
      return;
    }
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) {
      setFloater(null);
      selectionTrimmedRef.current = "";
      return;
    }
    const t = sel.toString().trim();
    if (!t || !fullAnswer.answer_text.includes(t)) {
      setFloater(null);
      selectionTrimmedRef.current = "";
      return;
    }
    selectionTrimmedRef.current = t;
    const rect = range.getBoundingClientRect();
    const pad = 8;
    const btnW = 72;
    setFloater({
      left: Math.max(pad, Math.min(rect.left, window.innerWidth - pad - btnW)),
      top: Math.max(pad, rect.top - 36),
    });
  }, [disabled, proofBusy, fullAnswer.answer_text]);

  useEffect(() => {
    document.addEventListener("selectionchange", updateFloater);
    return () => document.removeEventListener("selectionchange", updateFloater);
  }, [updateFloater]);

  function handleProofClick() {
    const built = buildProofAnswerFromSelection(fullAnswer, selectionTrimmedRef.current);
    if (!built.ok) {
      onProofInvalid?.(built.error);
      return;
    }
    window.getSelection()?.removeAllRanges();
    setFloater(null);
    selectionTrimmedRef.current = "";
    onProof(built.synthetic);
  }

  return (
    <>
      <div ref={ref} className={className}>
        <p className={textClassName}>{fullAnswer.answer_text}</p>
      </div>
      {floater ? (
        <button
          type="button"
          className="pointer-events-auto fixed z-[150] rounded-full bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-violet-900/20 hover:bg-violet-800 disabled:opacity-50"
          style={{ left: floater.left, top: floater.top }}
          disabled={proofBusy}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleProofClick}
        >
          Proof
        </button>
      ) : null}
    </>
  );
}
