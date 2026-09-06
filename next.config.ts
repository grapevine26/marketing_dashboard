import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
  },
  serverExternalPackages: ["pdfkit"],
  experimental: {
    serverActions: {
      // SNS 시안 미디어 업로드(최대 50MB)가 서버 액션으로 들어온다. 기본값 1MB면 사진 한 장도 413으로 실패한다.
      // multipart 오버헤드를 감안해 여유를 둔다.
      bodySizeLimit: "52mb",
    },
  },
};

export default nextConfig;
