import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pipeline_runs: defineTable({
    user_id: v.string(),
    query: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("decomposing"),
      v.literal("researching"),
      v.literal("retrieving"),
      v.literal("scoring"),
      v.literal("complete"),
      v.literal("error"),
    ),
    decomposition: v.optional(v.any()),
    search_queries: v.optional(v.any()),
    evidence_pool: v.optional(v.array(v.any())),
    top3: v.optional(v.array(v.any())),
    error: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_user", ["user_id"]),

  agent_logs: defineTable({
    pipeline_run_id: v.id("pipeline_runs"),
    agent: v.string(),
    status: v.union(
      v.literal("ok"),
      v.literal("error"),
      v.literal("rejected"),
    ),
    input_summary: v.string(),
    output_summary: v.optional(v.string()),
    error: v.optional(v.string()),
    timestamp: v.number(),
  }).index("by_run", ["pipeline_run_id"]),
});
