import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      bodySizeLimit: "52mb",
    },
  },
};

export default nextConfig;
