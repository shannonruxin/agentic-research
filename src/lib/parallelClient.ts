import Parallel from "parallel-web";

/**
 * Server-only: Parallel Extract API client (`parallel-web` SDK).
 * Set `PARALLEL_API_KEY` in the environment (e.g. `frontend/.env.local`).
 */
export function createParallelClient(): Parallel {
  const apiKey = process.env.PARALLEL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("PARALLEL_API_KEY is not set");
  }
  return new Parallel({ apiKey });
}
