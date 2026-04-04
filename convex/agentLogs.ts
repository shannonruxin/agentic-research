import { mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";

export const logAgentEvent = mutation({
  args: {
    pipeline_run_id: v.id("pipeline_runs"),
    agent: v.string(),
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("rejected")),
    input_summary: v.string(),
    output_summary: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("agent_logs", {
      pipeline_run_id: args.pipeline_run_id,
      agent: args.agent,
      status: args.status,
      input_summary: args.input_summary,
      output_summary: args.output_summary,
      error: args.error,
      timestamp: Date.now(),
    });
  },
});
