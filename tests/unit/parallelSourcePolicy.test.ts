import { afterEach, describe, expect, it } from "vitest";
import {
  mergeParallelSourcePolicy,
  normalizeDomainForPolicy,
  parallelSourcePolicyFromEnv,
  parallelSourcePolicyRequestFromLists,
} from "@/lib/parallelSourcePolicy";

describe("parallelSourcePolicyFromEnv", () => {
  afterEach(() => {
    delete process.env.PARALLEL_SEARCH_EXCLUDE_DOMAINS;
    delete process.env.PARALLEL_SEARCH_INCLUDE_DOMAINS;
    delete process.env.PARALLEL_SEARCH_AFTER_DATE;
    delete process.env.PARALLEL_SEARCH_BEFORE_DATE;
  });

  it("when env sets both lists, both are kept", () => {
    process.env.PARALLEL_SEARCH_EXCLUDE_DOMAINS = "wikipedia.org, Reddit.com";
    process.env.PARALLEL_SEARCH_INCLUDE_DOMAINS = "arxiv.org, nature.com";
    expect(parallelSourcePolicyFromEnv()).toEqual({
      exclude_domains: ["wikipedia.org", "reddit.com"],
      include_domains: ["arxiv.org", "nature.com"],
    });
  });

  it("returns null when unset", () => {
    expect(parallelSourcePolicyFromEnv()).toBeNull();
  });

  it("parses after date", () => {
    process.env.PARALLEL_SEARCH_AFTER_DATE = "2024-06-01";
    expect(parallelSourcePolicyFromEnv()).toEqual({ after_date: "2024-06-01" });
  });

  it("parses before date", () => {
    process.env.PARALLEL_SEARCH_BEFORE_DATE = "2025-12-31";
    expect(parallelSourcePolicyFromEnv()).toEqual({ before_date: "2025-12-31" });
  });
});

describe("mergeParallelSourcePolicy", () => {
  it("unions exclude_domains", () => {
    const m = mergeParallelSourcePolicy(
      { exclude_domains: ["wikipedia.org"] },
      { excludeDomains: ["reddit.com", "wikipedia.org"] },
    );
    expect(m?.exclude_domains?.sort()).toEqual(["reddit.com", "wikipedia.org"]);
  });

  it("request afterDate overrides env", () => {
    const m = mergeParallelSourcePolicy(
      { after_date: "2020-01-01" },
      { afterDate: "2024-01-01" },
    );
    expect(m?.after_date).toBe("2024-01-01");
  });

  it("request beforeDate overrides env", () => {
    const m = mergeParallelSourcePolicy(
      { before_date: "2020-12-31" },
      { beforeDate: "2025-06-01" },
    );
    expect(m?.before_date).toBe("2025-06-01");
  });

  it("unions include_domains when both sides set", () => {
    const m = mergeParallelSourcePolicy(
      { include_domains: ["arxiv.org"] },
      { includeDomains: ["nature.com"] },
    );
    expect(m?.include_domains?.sort()).toEqual(["arxiv.org", "nature.com"]);
  });

  it("keeps exclude_domains when merged result has include_domains", () => {
    const m = mergeParallelSourcePolicy(
      { exclude_domains: ["wikipedia.org"] },
      { includeDomains: ["arxiv.org"] },
    );
    expect(m).toEqual({
      exclude_domains: ["wikipedia.org"],
      include_domains: ["arxiv.org"],
    });
  });
});

describe("normalizeDomainForPolicy", () => {
  it("strips scheme path and www", () => {
    expect(normalizeDomainForPolicy("https://www.Example.com/foo")).toBe("example.com");
  });

  it("returns null for empty", () => {
    expect(normalizeDomainForPolicy(" ")).toBeNull();
  });
});

describe("parallelSourcePolicyRequestFromLists", () => {
  it("builds exclude list when include is empty", () => {
    expect(
      parallelSourcePolicyRequestFromLists({
        excludeDomains: ["wikipedia.org"],
        includeDomains: [],
        publishedAfter: "",
        publishedBefore: "",
      }),
    ).toEqual({ excludeDomains: ["wikipedia.org"] });
  });

  it("include and exclude both appear in payload when set", () => {
    expect(
      parallelSourcePolicyRequestFromLists({
        excludeDomains: ["wikipedia.org", "reddit.com"],
        includeDomains: ["arxiv.org"],
        publishedAfter: "",
        publishedBefore: "",
      }),
    ).toEqual({
      excludeDomains: ["wikipedia.org", "reddit.com"],
      includeDomains: ["arxiv.org"],
    });
  });

  it("includes published-after and published-before when set", () => {
    expect(
      parallelSourcePolicyRequestFromLists({
        excludeDomains: ["wikipedia.org"],
        includeDomains: [],
        publishedAfter: "2024-01-01",
        publishedBefore: "2025-12-31",
      }),
    ).toEqual({
      excludeDomains: ["wikipedia.org"],
      afterDate: "2024-01-01",
      beforeDate: "2025-12-31",
    });
  });

  it("truncates each list to 10 domains (Parallel limit)", () => {
    const many = Array.from({ length: 15 }, (_, i) => `d${i}.com`);
    const out = parallelSourcePolicyRequestFromLists({
      excludeDomains: many,
      includeDomains: many,
      publishedAfter: "",
      publishedBefore: "",
    });
    expect(out?.excludeDomains).toHaveLength(10);
    expect(out?.includeDomains).toHaveLength(10);
    expect(out?.excludeDomains?.[0]).toBe("d0.com");
    expect(out?.excludeDomains?.[9]).toBe("d9.com");
  });
});
