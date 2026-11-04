import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Docker image sets this to ship the self-contained standalone server;
  // plain `next start` keeps working without it.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
