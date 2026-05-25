import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// When a parent directory also has a lockfile, Turbopack can pick the wrong root and
// resolve packages from there (e.g. missing tailwindcss). Pin root to this app.
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
  },
};

export default nextConfig;
