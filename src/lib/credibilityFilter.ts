import type { RetrievedPage } from "@/lib/types";

/**
 * Credibility gate before verbatim extraction (Requirement 4).
 * All four conditions must hold.
 */
export function passesCredibilityFilter(page: RetrievedPage): boolean {
  if (page.httpStatus !== 200) {
    return false;
  }
  if (!page.author?.trim()) {
    return false;
  }
  if (!page.publication?.trim()) {
    return false;
  }
  if (page.year === null || page.year === undefined) {
    return false;
  }
  return true;
}
