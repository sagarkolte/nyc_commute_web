import type { NextConfig } from "next";

// Trigger Vercel Deploy - Dec 18 Reset

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
    outputFileTracingIncludes: {
      '/api/**/*': ['./src/lib/njt_schedule.db'],
    },
  },
};

export default nextConfig;
