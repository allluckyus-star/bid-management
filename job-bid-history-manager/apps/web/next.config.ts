import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@jbhm/shared"],
  /** Hide the floating Next.js “N” dev indicator in the corner during `next dev`. */
  devIndicators: false,
};

export default nextConfig;
