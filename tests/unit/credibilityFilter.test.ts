import { describe, expect, it } from "vitest";
import { passesCredibilityFilter } from "@/lib/credibilityFilter";
import type { RetrievedPage } from "@/lib/types";

function page(partial: Partial<RetrievedPage>): RetrievedPage {
  return {
    url: "https://example.com/a",
    author: "A Author",
    publication: "Journal",
    year: 2020,
    cleanText: "body",
    httpStatus: 200,
    ...partial,
  };
}

describe("passesCredibilityFilter", () => {
  it("returns true when all fields pass", () => {
    expect(passesCredibilityFilter(page({}))).toBe(true);
  });

  it("rejects non-200", () => {
    expect(passesCredibilityFilter(page({ httpStatus: 404 }))).toBe(false);
  });

  it("rejects missing author", () => {
    expect(passesCredibilityFilter(page({ author: null }))).toBe(false);
    expect(passesCredibilityFilter(page({ author: "  " }))).toBe(false);
  });

  it("rejects missing publication", () => {
    expect(passesCredibilityFilter(page({ publication: null }))).toBe(false);
  });

  it("rejects null year", () => {
    expect(passesCredibilityFilter(page({ year: null }))).toBe(false);
  });
});
