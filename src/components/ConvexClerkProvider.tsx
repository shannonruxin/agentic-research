"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { SyncConvexUser } from "@/components/SyncConvexUser";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl
  ? new ConvexReactClient(convexUrl, {
      // Suppress the "Are you sure you want to leave? Your changes may not be saved."
      // popup that Convex fires on navigation/redirect while requests are in flight
      // (e.g. when Clerk's <UserButton /> triggers a session refresh on first mount).
      unsavedChangesWarning: false,
    })
  : null;

/**
 * Next.js App Router: `ClerkProvider` must wrap `ConvexProviderWithClerk` (see Convex + Clerk guide).
 * @see https://docs.convex.dev/auth/clerk#nextjs
 * Without `NEXT_PUBLIC_CONVEX_URL`, the app still runs (Clerk only); add the URL to sync users to Convex.
 */
export function ConvexClerkProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider ui={ui}>
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
