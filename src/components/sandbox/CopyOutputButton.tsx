"use client";

import { useCallback, useState } from "react";

export type CopyOutputButtonProps = {
  text: string;
  /** Button label; briefly shows "Copied!" after success. */
  label?: string;
  disabled?: boolean;
  className?: string;
};

const baseClass =
  "rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600";

export function CopyOutputButton({
  text,
  label = "Copy",
  disabled = false,
  className = "",
}: CopyOutputButtonProps) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    if (!text || disabled) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be denied */
    }
  }, [text, disabled]);

  return (
    <button
      type="button"
      className={`${baseClass} ${className}`.trim()}
      disabled={disabled || !text}
      onClick={() => void onClick()}
      aria-label={copied ? "Copied to clipboard" : `Copy ${label} to clipboard`}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
