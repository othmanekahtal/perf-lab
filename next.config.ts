import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PERF-BUG #5: React Compiler is explicitly OFF. It would auto-memoize components
  // and hide the context re-render problem this lab measures.
  reactCompiler: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
