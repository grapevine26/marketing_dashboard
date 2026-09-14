import type { NextConfig } from "next";

/**
 * 모든 응답에 붙는 보안 헤더.
 *
 * 이 앱에는 로그인 없이 열리는 광고주·인플루언서 링크가 있고, 그 화면에 "승인"·"최종선정" 버튼이 있다.
 * 다른 사이트가 그 화면을 투명한 프레임으로 덮어 클릭을 유도하는 것(클릭재킹)을 frame-ancestors 로 막는다.
 * 이 앱 자신도 프레임 안에 넣지 않으므로 잃는 것이 없다.
 *
 * script-src 까지 포함한 전체 CSP 는 넣지 않았다. app/layout.tsx 의 테마 초기화 인라인 스크립트에
 * nonce 를 붙이는 작업이 먼저다. 지금 값은 그것과 충돌하지 않는 것만 골랐다.
 */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  // "X-Powered-By: Next.js" 를 붙이지 않는다. 공격자에게 프레임워크를 알려줄 이유가 없다.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
  },
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // 브라우저가 방금 본 페이지를 1분간 기억한다. 메뉴를 오갈 때 서버에 다시 안 간다.
    // Next 15 에서 기본값이 30초 -> 0초로 바뀌면서, 되돌아가도 매번 새로 받게 됐다.
    //
    // 내가 저장한 내용은 서버 액션의 revalidatePath 가 이 캐시를 즉시 비우므로 바로 반영된다.
    // 남이 바꾼 것(인플루언서 지원, 광고주 승인 등)만 최대 1분 늦을 수 있는데,
    // 탭으로 돌아올 때 RefreshOnFocus 가 다시 불러오므로 실제로 오래된 화면을 볼 일은 드물다.
    staleTimes: {
      dynamic: 60,
    },
    serverActions: {
      // 로컬 개발에서만 시안 미디어가 서버 액션으로 들어온다. 기본값 1MB면 사진 한 장도 413이다.
      // 배포에서는 브라우저가 Blob 으로 직접 올린다. Vercel 함수의 4.5MB 본문 한도는
      // 이 설정으로 못 올리기 때문이다. app/api/media/upload/route.ts 참고.
      // 배포에서는 공개 폼(지원서·사전조사)도 서버 액션이라, 52MB 를 전역으로 열어두면
      // 로그인 없는 요청이 그 크기를 보낼 수 있다. Vercel 의 4.5MB 한도에 기대지 않고 직접 줄인다.
      bodySizeLimit: process.env.VERCEL ? "4mb" : "52mb",
    },
  },
};

export default nextConfig;
