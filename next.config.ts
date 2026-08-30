import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
  },
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
