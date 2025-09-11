import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Ensure Next.js treats this app directory as the workspace root
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
