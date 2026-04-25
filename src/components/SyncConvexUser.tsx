"use client";

import { api } from "../../convex/_generated/api";
import { useConvexAuth, useMutation } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";

const SYNC_RETRIES = 4;
const RETRY_MS = 600;

/**
 * After Clerk + Convex report auth (see ConvexProviderWithAuth), upsert `users` in Convex.
 * Retries a few times in case the first mutation runs before the JWT is fully wired.
 */
export function SyncConvexUser() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { userId } = useAuth();
  const sync = useMutation(api.users.syncCurrent);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    const run = async (attempt: number) => {
      try {
        await sync();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const retryable =
          message.includes("Not authenticated") && attempt < SYNC_RETRIES;
        if (retryable) {
          await new Promise((r) => setTimeout(r, RETRY_MS * (attempt + 1)));
          await run(attempt + 1);
          return;
        }
        console.error(
          "[SyncConvexUser] users.syncCurrent failed. Check Convex `CLERK_JWT_ISSUER_DOMAIN`, Clerk Convex integration, and that `npx convex dev` is connected to the deployment in `NEXT_PUBLIC_CONVEX_URL`.",
          err,
        );
      }
    };

    void run(0);
  }, [isLoading, isAuthenticated, userId, sync]);

  return null;
}
