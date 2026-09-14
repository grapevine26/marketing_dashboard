import { NextResponse, type NextRequest } from "next/server";
import { createProxyAuthClient, PERSIST_COOKIE } from "@/lib/supabase/auth";

/**
 * 로그인 검사의 바깥 겹.
 *
 * Next.js 16 에서 middleware 는 proxy 로 이름이 바뀌었다.
 *
 * 여기서는 **쿠키에 유효한 세션이 있는지만** 본다. DB 를 보지 않는다.
 * 모든 요청마다, 심지어 미리 가져오는 요청에도 돌기 때문에 느려지면 안 된다.
 * 승인 상태 같은 진짜 판정은 데이터에 닿는 쪽(lib/auth/session.ts)에서 한다.
 *
 * 세션 토큰 갱신도 여기서 한다. 서버 컴포넌트는 쿠키를 쓸 수 없어서 갱신을 맡을 수 없다.
 */

/** 로그인 없이 열려야 하는 경로(정확히 일치). */
const PUBLIC_PATHS = ["/login", "/signup"];

/**
 * 로그인 없이 열려야 하는 경로(접두사). 광고주와 인플루언서가 쓰는 링크들이다.
 * 접두사는 반드시 `/` 로 끝낸다. `/login` 처럼 두면 `/login-admin` 같은 경로까지 열린다.
 *
 * `/api/media/` 아래의 upload 는 공개가 아니다. 라우트 안에서 requireApiUser 로 따로 막는다.
 * `/api/storage-health` 는 예전에 공개였다. 호출마다 저장소에 쓰기를 하고 내부 오류를 그대로
 * 돌려주므로 로그인 뒤로 옮겼다. 배포 점검은 로그인한 브라우저에서 열면 된다.
 */
const PUBLIC_PREFIXES = [
  "/apply/",
  "/pre-survey/",
  "/applicants/",
  "/seeding-sheet/",
  "/sns-approval/",
  "/sns-intake/",
  "/api/media/",
  "/api/cron/",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  if (isPublic(pathname)) return response;

  const persist = request.cookies.get(PERSIST_COOKIE)?.value === "1";

  let hasSession = false;
  try {
    const supabase = createProxyAuthClient(
      () => request.cookies.getAll(),
      (name, value, options) => {
        // 갱신된 토큰을 요청과 응답 양쪽에 실어, 이어지는 렌더가 새 값을 보게 한다.
        request.cookies.set(name, value);
        response = NextResponse.next({ request });
        response.cookies.set(name, value, options);
      },
      persist
    );
    const { data } = await supabase.auth.getUser();
    hasSession = Boolean(data.user);
  } catch {
    // 환경 변수가 없거나 인증 서버에 닿지 못하면 로그인하지 않은 것으로 본다.
    hasSession = false;
  }

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // 로그인 후 원래 가려던 곳으로 되돌려 보낸다.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 정적 파일과 이미지 최적화 경로는 건너뛴다.
     * 아이콘·매니페스트도 로그인 전에 보여야 한다.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
