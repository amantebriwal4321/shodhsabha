import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/sabha": ["./data/demos/**/*", "./finch/skills/**/*"],
    "/api/finch/invoke": ["./data/demos/**/*", "./finch/skills/**/*"],
    "/api/export": ["./finch/skills/**/*"],
  },
};

export default nextConfig;
