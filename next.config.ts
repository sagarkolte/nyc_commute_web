import type { NextConfig } from "next";

// Trigger Vercel Deploy - Dec 18 Reset

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
    // @ts-expect-error - Valid in Vercel/Next15+ but types might lag
    outputFileTracingIncludes: {
      '/api/**/*': ['./src/lib/njt_schedule.db'],
    },
  },
};

export default nextConfig;
