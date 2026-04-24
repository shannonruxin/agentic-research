"use client";

import { api } from "../../convex/_generated/api";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";

/**
 * After Clerk + Convex auth succeeds, upsert `users` in Convex.
 */
export function SyncConvexUser() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const sync = useMutation(api.users.syncCurrent);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    void sync();
  }, [isLoading, isAuthenticated, sync]);

  return null;
}
