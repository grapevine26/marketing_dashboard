import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
  },
  serverExternalPackages: ["pdfkit"],
  experimental: {
    serverActions: {
      // 로컬 개발에서만 시안 미디어가 서버 액션으로 들어온다. 기본값 1MB면 사진 한 장도 413이다.
      // 배포에서는 브라우저가 Blob 으로 직접 올린다. Vercel 함수의 4.5MB 본문 한도는
      // 이 설정으로 못 올리기 때문이다. app/api/media/upload/route.ts 참고.
      bodySizeLimit: "52mb",
    },
  },
};

export default nextConfig;
