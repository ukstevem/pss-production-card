import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/production-card",
  trailingSlash: true,
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ["@platform/supabase", "@platform/auth", "@platform/ui"],
};

export default nextConfig;
