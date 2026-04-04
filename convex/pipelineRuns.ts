import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const runStatus = v.union(
  v.literal("pending"),
  v.literal("decomposing"),
  v.literal("researching"),
  v.literal("retrieving"),
  v.literal("scoring"),
  v.literal("complete"),
  v.literal("error"),
);

export const createRun = mutation({
  args: {
    user_id: v.string(),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("pipeline_runs", {
      user_id: args.user_id,
      query: args.query,
      status: "pending",
      created_at: now,
      updated_at: now,
    });
  },
});

export const updateRunStatus = mutation({
  args: {
    run_id: v.id("pipeline_runs"),
    status: runStatus,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.run_id, {
      status: args.status,
      updated_at: Date.now(),
    });
  },
});

export const setDecomposition = mutation({
  args: {
    run_id: v.id("pipeline_runs"),
    decomposition: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.run_id, {
      decomposition: args.decomposition,
      updated_at: Date.now(),
    });
  },
});

export const setSearchQueries = mutation({
  args: {
    run_id: v.id("pipeline_runs"),
    search_queries: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.run_id, {
      search_queries: args.search_queries,
      updated_at: Date.now(),
    });
  },
});

export const setEvidencePool = mutation({
  args: {
    run_id: v.id("pipeline_runs"),
    evidence_pool: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.run_id, {
      evidence_pool: args.evidence_pool,
      updated_at: Date.now(),
    });
  },
});

export const setTop3 = mutation({
  args: {
    run_id: v.id("pipeline_runs"),
    top3: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.run_id, {
      top3: args.top3,
      updated_at: Date.now(),
    });
  },
});

export const setError = mutation({
  args: {
    run_id: v.id("pipeline_runs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.run_id, {
      error: args.error,
      updated_at: Date.now(),
    });
  },
});

/**
 * Pipeline run for realtime UI: pass `run_id` from the API when you need that run;
 * omit it to use the latest run for this user (by creation time).
 */
export const getRunByUser = query({
  args: {
    user_id: v.string(),
    run_id: v.optional(v.id("pipeline_runs")),
  },
  handler: async (ctx, args) => {
    if (args.run_id !== undefined) {
      const run = await ctx.db.get(args.run_id);
      if (!run || run.user_id !== args.user_id) {
        return null;
      }
      return run;
    }
    return await ctx.db
      .query("pipeline_runs")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .order("desc")
      .first();
  },
});
