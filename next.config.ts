import type { NextConfig } from "next";

// Trigger Vercel Deploy - Dec 18 Reset

const isExport = process.env.NEXT_PUBLIC_IS_EXPORT === 'true';

const nextConfig: NextConfig = {
  output: isExport ? 'export' : undefined,
  images: {
    unoptimized: isExport,
  },
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
    // @ts-expect-error - Valid in Vercel/Next15+ but types might lag
    outputFileTracingIncludes: {
      '/api/**/*': ['./src/lib/njt_schedule.db'],
    },
  },
  async headers() {
    if (isExport) return [];
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-mta-api-key" },
        ]
      }
    ]
  }
};

export default nextConfig;
