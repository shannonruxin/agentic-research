import type { AuthConfig } from "convex/server";

/**
 * Must match the repo’s `.env` and Convex Dashboard → `CLERK_JWT_ISSUER_DOMAIN`.
 * @see https://docs.convex.dev/auth/clerk
 */
const domain =
  process.env.CLERK_JWT_ISSUER_DOMAIN ?? process.env.CLERK_FRONTEND_API_URL;
if (!domain) {
  throw new Error(
    "Set CLERK_JWT_ISSUER_DOMAIN in the Convex dev/prod environment (Clerk JWT issuer, same as Frontend API URL).",
  );
}

export default {
  providers: [
    {
      domain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;