import type { AuthConfig } from "convex/server";

/**
 * Clerk JWT validation. Set `CLERK_JWT_ISSUER_DOMAIN` in the Convex dashboard
 * (same value as Clerk’s “Frontend API URL” / issuer from the Clerk → Convex integration).
 * @see https://docs.convex.dev/auth/clerk
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
