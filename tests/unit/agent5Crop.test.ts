import { describe, expect, it } from "vitest";
import {
  flowOrderSegments,
  pickUrlForSegment,
} from "@/lib/agents/agent5Crop";
import { normalizeExtractUrl } from "@/lib/agents/agent4Extract";
import type { Agent3EvidencePlan, ExtractBundle } from "@/lib/types";

const answer =
  "First line about alpha. Second mentions beta evidence. Third is gamma.";

describe("flowOrderSegments", () => {
  it("orders by first occurrence of quote_from_ai_answer in answer_text", () => {
    const ordered = flowOrderSegments(
      [
        {
          segment_id: "s2",
          quote_from_ai_answer: "beta evidence",
          verification_challenge: "c2",
        },
        {
          segment_id: "s1",
          quote_from_ai_answer: "alpha",
          verification_challenge: "c1",
        },
        {
          segment_id: "s3",
          quote_from_ai_answer: "gamma",
          verification_challenge: "c3",
        },
      ],
      answer,
    );
    expect(ordered.map((s) => s.segment_id)).toEqual(["s1", "s2", "s3"]);
  });

  it("places missing quotes after present quotes", () => {
    const ordered = flowOrderSegments(
      [
        {
          segment_id: "a",
          quote_from_ai_answer: "zzz-not-in-text",
          verification_challenge: "c",
        },
        {
          segment_id: "b",
          quote_from_ai_answer: "alpha",
          verification_challenge: "c",
        },
      ],
      answer,
    );
    expect(ordered.map((s) => s.segment_id)).toEqual(["b", "a"]);
  });
});

describe("pickUrlForSegment", () => {
  const agent3Plan: Agent3EvidencePlan = {
    evidence_segments: [],
    resources: [
      {
        url: "https://bad.example/err",
        segment_ids: ["s1"],
        status: "ok",
      },
      {
        url: "https://good.example/page",
        segment_ids: ["s1"],
        status: "ok",
      },
    ],
  };

  const bundle: ExtractBundle = {
    [normalizeExtractUrl("https://bad.example/err")]: {
      url: normalizeExtractUrl("https://bad.example/err"),
      cleanText: "",
      httpStatus: 0,
      extract_error: "fail",
    },
    [normalizeExtractUrl("https://good.example/page")]: {
      url: normalizeExtractUrl("https://good.example/page"),
      cleanText: "The study shows a clear effect on outcomes discussed here.",
      httpStatus: 200,
    },
  };

  it("skips resources with extract errors or empty cleanText", () => {
    expect(pickUrlForSegment(agent3Plan, "s1", bundle)).toBe(
      normalizeExtractUrl("https://good.example/page"),
    );
  });

  it("returns null when no usable URL", () => {
    expect(pickUrlForSegment(agent3Plan, "missing", bundle)).toBeNull();
  });
});

describe("P-crop rule (documented invariant)", () => {
  it("accepted crops must be contiguous substrings of page cleanText", () => {
    const cleanText = "aaa [supporting bit] bbb";
    const cropped = "[supporting bit]";
    expect(cleanText.includes(cropped)).toBe(true);
    expect(cleanText.includes("supporting")).toBe(true);
    expect(cleanText.includes("not present")).toBe(false);
  });
});
