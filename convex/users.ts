import { mutation, query } from "./_generated/server";

/**
 * Upsert the signed-in user from `ctx.auth.getUserIdentity()` (Clerk → Convex JWT).
 * Call from the client after login (see `SyncConvexUser`).
 */
export const syncCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const tokenIdentifier = identity.tokenIdentifier;
    const clerkUserId = identity.subject;
    const now = Date.now();

    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();

    const name = identity.name ?? undefined;
    const email = identity.email ?? undefined;
    const imageUrl = identity.pictureUrl ?? undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        email,
        imageUrl,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier,
      clerkUserId,
      name,
      email,
      imageUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    return await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
  },
});
