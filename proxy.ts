import { NextResponse, type NextRequest } from "next/server";
import { createProxyAuthClient, PERSIST_COOKIE } from "@/lib/supabase/auth";
import { buildCsp, createNonce } from "@/lib/security/csp";

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
 *
 * CSP 난수(nonce)도 여기서 만든다. 요청마다 달라야 하는 값이라 정적 설정(next.config.ts)에
 * 둘 수 없다. 자세한 이유는 lib/security/csp.ts 참고.
 */

/** 로그인 없이 열려야 하는 경로(정확히 일치). */
// robots.txt 는 크롤러가 **로그인 없이** 읽어야 의미가 있다. 여기 없으면 로그인 화면으로
// 튕기고, 크롤러는 그것을 "robots.txt 가 없다" 로 읽어 마음껏 긁는다.
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/robots.txt",
  // 광고주가 공유 화면에서 누르는 내려받기. **토큰이 있을 때만** 실제로 열린다.
  // 라우트 안에서 토큰이 없으면 requireApiUser 로 막고, 토큰 모드에서는 개인정보를 씻어 내보낸다.
  // 여기를 열지 않으면 광고주가 버튼을 눌러도 로그인 화면으로 튕긴다(실제로 그 상태였다).
  //
  // 접두사가 아니라 **정확히 일치**로 둔다. 접두사로 두면 startsWith 라서
  // `/api/applicants/export-all` 같은 주소까지 미리 열어두는 셈이 된다. 지금은 그런
  // 라우트가 없어 새는 것이 없지만, 언젠가 그 이름으로 만드는 사람이 프록시를 다시 볼
  // 이유가 없다. 두 라우트 모두 하위 경로 없이 쿼리스트링만 쓰므로 잃는 것이 없다.
  "/api/applicants/export",
  "/api/seeding-sheet/export",
];

/**
 * 로그인 없이 열려야 하는 경로(접두사). 광고주와 인플루언서가 쓰는 링크들이다.
 * 접두사는 반드시 `/` 로 끝낸다. `/login` 처럼 두면 `/login-admin` 같은 경로까지 열린다.
 *
 * `/api/media/` 아래의 upload 는 공개가 아니다. 라우트 안에서 requireApiUser 로 따로 막는다.
 * `/api/storage-health` 는 예전에 공개였다. 호출마다 저장소에 쓰기를 하고 내부 오류를 그대로
 * 돌려주므로 로그인 뒤로 옮겼다. 배포 점검은 로그인한 브라우저에서 열면 된다.
 */
const PUBLIC_PREFIXES = [
  // 초대 링크로 들어오는 가입 화면. 토큰이 주소에 있어 로그인 없이 열려야 한다.
  "/signup/",
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

/**
 * 요청을 그대로 흘려보내되 CSP 난수를 얹는다.
 *
 * 난수는 **요청 헤더에도** 넣어야 한다. Next 가 렌더할 때 그 헤더를 읽어 자기가 만드는
 * 스크립트 태그에 같은 난수를 붙이기 때문이다. 응답 헤더에만 넣으면 브라우저는 막고
 * Next 는 난수를 모르는 상태가 되어 화면이 통째로 죽는다.
 *
 * 헤더는 그때그때 request 에서 새로 뜬다. 토큰이 갱신되면 request.cookies 가 바뀌는데,
 * 미리 떠 둔 사본을 쓰면 그 갱신이 렌더로 전달되지 않는다.
 */
function passThrough(request: NextRequest, nonce: string, csp: string): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = createNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  let response = passThrough(request, nonce, csp);

  if (isPublic(pathname)) return response;

  const persist = request.cookies.get(PERSIST_COOKIE)?.value === "1";

  let hasSession = false;
  try {
    const supabase = createProxyAuthClient(
      () => request.cookies.getAll(),
      (name, value, options) => {
        // 갱신된 토큰을 요청과 응답 양쪽에 실어, 이어지는 렌더가 새 값을 보게 한다.
        request.cookies.set(name, value);
        response = passThrough(request, nonce, csp);
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
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 정적 파일과 이미지 최적화 경로는 건너뛴다.
     * 아이콘·매니페스트도 로그인 전에 보여야 한다.
     *
     * 확장자 제외는 `public/` 에 놓인 파일을 위한 것이라 **최상위 한 칸에만** 건다
     * (`/logo.png` 는 건너뛰고 `/files/a.png` 는 건너뛰지 않는다). 전에는 경로 전체를
     * 대상으로 해서, 끝이 이미지 확장자이기만 하면 어떤 라우트든 프록시를 통째로
     * 건너뛰었다. 지금은 그런 라우트가 없어 새는 것이 없지만, 그런 주소를 만드는 날
     * 로그인 검사도 CSP 도 붙지 않는다.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|[^/]+\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
