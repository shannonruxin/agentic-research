import { describe, expect, it } from "vitest";
import {
  assertYearRangeOnAllQueries,
  mergeStrategicResearchRows,
  StrategicResearchValidationError,
} from "@/lib/agents/strategicResearch";

describe("mergeStrategicResearchRows", () => {
  const expectedIds = ["a1", "a2"];

  it("merges by_angle into SearchQueries", () => {
    const out = mergeStrategicResearchRows(
      {
        by_angle: [
          {
            angle_id: "a1",
            items: [
              { type: "baseline", query: "q1", reasoning: "r1" },
              { type: "deep", query: "q2", reasoning: "r2" },
            ],
          },
          {
            angle_id: "a2",
            items: [
              { type: "baseline", query: "q3", reasoning: "r3" },
              { type: "deep", query: "q4", reasoning: "r4" },
            ],
          },
        ],
      },
      expectedIds,
    );
    expect(out.a1).toHaveLength(2);
    expect(out.a1![0]).toEqual({ type: "baseline", query: "q1", reasoning: "r1" });
    expect(out.a2).toHaveLength(2);
  });

  it("throws on unexpected angle_id", () => {
    expect(() =>
      mergeStrategicResearchRows(
        {
          by_angle: [
            {
              angle_id: "a1",
              items: [
                { type: "b", query: "q", reasoning: "r" },
                { type: "b", query: "q2", reasoning: "r2" },
              ],
            },
            {
              angle_id: "bogus",
              items: [
                { type: "b", query: "q", reasoning: "r" },
                { type: "b", query: "q2", reasoning: "r2" },
              ],
            },
          ],
        },
        expectedIds,
      ),
    ).toThrow(StrategicResearchValidationError);
  });

  it("throws on duplicate angle_id", () => {
    expect(() =>
      mergeStrategicResearchRows(
        {
          by_angle: [
            {
              angle_id: "a1",
              items: [
                { type: "b", query: "q", reasoning: "r" },
                { type: "b", query: "q2", reasoning: "r2" },
              ],
            },
            {
              angle_id: "a1",
              items: [
                { type: "b", query: "q", reasoning: "r" },
                { type: "b", query: "q2", reasoning: "r2" },
              ],
            },
          ],
        },
        ["a1"],
      ),
    ).toThrow(StrategicResearchValidationError);
  });

  it("throws on missing angle", () => {
    expect(() =>
      mergeStrategicResearchRows(
        {
          by_angle: [
            {
              angle_id: "a1",
              items: [
                { type: "b", query: "q", reasoning: "r" },
                { type: "b", query: "q2", reasoning: "r2" },
              ],
            },
          ],
        },
        expectedIds,
      ),
    ).toThrow(StrategicResearchValidationError);
  });
});

describe("assertYearRangeOnAllQueries", () => {
  const two = (q1: string, q2: string) => [
    { type: "baseline", query: q1, reasoning: "r" },
    { type: "deep", query: q2, reasoning: "r" },
  ];

  it("no-ops when yearRange is undefined or blank", () => {
    assertYearRangeOnAllQueries({ x: two("a", "b") }, undefined);
    assertYearRangeOnAllQueries({ x: two("a", "b") }, "   ");
  });

  it("throws when a query omits the year range text", () => {
    expect(() =>
      assertYearRangeOnAllQueries({ x: two("smoking study", "smoking cohort") }, "2018-2024"),
    ).toThrow(StrategicResearchValidationError);
  });

  it("accepts en-dash normalized to hyphen in query", () => {
    assertYearRangeOnAllQueries(
      { x: two("papers 2018–2024 smoking", "meta 2018-2024") },
      "2018-2024",
    );
  });
});
