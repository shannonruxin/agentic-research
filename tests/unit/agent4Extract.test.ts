import { describe, expect, it } from "vitest";
import {
  collectExtractUrls,
  normalizeExtractUrl,
} from "@/lib/agents/agent4Extract";
import type { Agent3EvidencePlan, AIAnswerOutput } from "@/lib/types";

function aiAnswer(over: Partial<AIAnswerOutput> = {}): AIAnswerOutput {
  return {
    answer_text: "x",
    declared_sources: [],
    ...over,
  };
}

function plan(over: Partial<Agent3EvidencePlan> = {}): Agent3EvidencePlan {
  return {
    evidence_segments: [],
    resources: [],
    ...over,
  };
}

describe("normalizeExtractUrl", () => {
  it("strips hash and normalizes", () => {
    expect(normalizeExtractUrl("https://ex.com/path#frag")).toBe(
      "https://ex.com/path",
    );
  });

  it("returns trimmed string on invalid URL", () => {
    expect(normalizeExtractUrl("  not-a-url  ")).toBe("not-a-url");
  });
});

describe("collectExtractUrls", () => {
  it("unions Agent 3 resources and declared_sources with stable dedupe", () => {
    const urls = collectExtractUrls(
      aiAnswer({
        declared_sources: [
          { url: "https://a.com/x" },
          { url: "https://b.com/" },
          { url: "https://a.com/x#" },
        ],
      }),
      plan({
        resources: [
          {
            url: "https://b.com/",
            segment_ids: [],
            status: "ok",
          },
          {
            url: "https://c.com/p",
            segment_ids: [],
            status: "ok",
          },
        ],
      }),
    );
    expect(urls).toEqual([
      "https://b.com/",
      "https://c.com/p",
      "https://a.com/x",
    ]);
  });

  it("skips empty URLs", () => {
    expect(
      collectExtractUrls(
        aiAnswer({ declared_sources: [{ url: "  " }] }),
        plan({
          resources: [{ url: "", segment_ids: [], status: "ok" }],
        }),
      ),
    ).toEqual([]);
  });
});
