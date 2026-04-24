"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { SyncConvexUser } from "@/components/SyncConvexUser";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * Clerk must wrap Convex so `useAuth` works inside `ConvexProviderWithClerk`.
 * Without `NEXT_PUBLIC_CONVEX_URL`, the app still runs (Clerk only); add the URL to sync users to Convex.
 */
export function ConvexClerkProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      {convex ? (
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <SyncConvexUser />
          {children}
        </ConvexProviderWithClerk>
      ) : (
        children
      )}
    </ClerkProvider>
  );
}
