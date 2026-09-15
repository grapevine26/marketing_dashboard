/**
 * Content-Security-Policy 를 요청마다 만든다.
 *
 * 전에는 `frame-ancestors` 처럼 스크립트와 무관한 항목만 넣어 두었다. XSS 가 생겼을 때
 * 정작 스크립트 실행을 막지 못했다. 이제 요청마다 난수(nonce)를 만들어 그 값을 단 스크립트만
 * 실행되게 한다. 공격자가 페이지에 <script> 를 밀어 넣어도 난수를 맞출 수 없으니 실행되지 않는다.
 *
 * 왜 nonce 인가: 해시 방식은 Next 가 스트리밍하며 끼워 넣는 인라인 스크립트가 페이지마다
 * 달라서 못 쓴다. 정적 렌더 유지를 위한 SRI 방식은 이 버전에서 아직 experimental 이다.
 * 실사용 중인 앱에 experimental 플래그를 켜는 것보다 nonce 가 안전하다.
 *
 * 대신 nonce 를 쓰면 **모든 페이지가 요청마다 렌더**되어야 한다. 정적으로 미리 만든 HTML 에는
 * 그 요청의 난수가 들어갈 수 없기 때문이다. 그래서 app/layout.tsx 에 force-dynamic 을 걸었다.
 * 이 앱은 원래 /signup 말고는 전부 동적이었고 쓰는 사람이 몇 명뿐이라 잃는 것이 없다.
 */

/** 스타일은 'unsafe-inline' 로 둔다.
 *
 * 화면 여러 곳이 `style={{ width: ... }}` 처럼 계산된 값을 인라인 속성으로 넣는다(진행률 막대 등).
 * CSP 에서 인라인 style 속성은 nonce 를 붙일 방법이 없어서, 조이면 그 화면들이 깨진다.
 * 스타일로 할 수 있는 공격은 스크립트에 비하면 훨씬 제한적이라 여기서 멈추는 편이 낫다.
 */
const STYLE_SRC = "'self' 'unsafe-inline'";

/**
 * 브라우저가 Blob 저장소에 파일을 직접 올린다(app/api/media/upload/route.ts 참고).
 * Vercel 함수 본문 한도(4.5MB)를 피하려는 것이라 이 두 곳은 반드시 열어야 한다.
 * - https://vercel.com/api/blob : 업로드를 시작하는 곳 (@vercel/blob 의 기본 API 주소)
 * - https://*.vercel-storage.com : 실제 파일이 올라가는 곳
 */
const BLOB_HOSTS = "https://vercel.com https://*.vercel-storage.com";

/** 요청 하나에 쓸 난수. 예측할 수 없어야 하므로 crypto 로 만든다. */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function buildCsp(nonce: string, isDev: boolean): string {
  // 개발에서는 React 가 서버 오류 스택을 브라우저에서 되살리려고 eval 을 쓰고,
  // HMR 이 웹소켓으로 붙는다. 배포에는 둘 다 필요 없다.
  const scriptExtra = isDev ? " 'unsafe-eval'" : "";
  const connectExtra = isDev ? " ws: wss:" : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${scriptExtra}`,
    `style-src ${STYLE_SRC}`,
    // 시안 이미지는 /api/media/[id] (같은 출처)로 내려오고, 올리기 전 미리보기는 blob: URL 이다.
    "img-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    // 글꼴은 next/font 로 앱에 같이 담겨 있어 외부에 요청하지 않는다.
    "font-src 'self'",
    `connect-src 'self' ${BLOB_HOSTS}${connectExtra}`,
    // 이 앱은 무엇도 프레임에 넣지 않고, 어디에도 프레임으로 들어가지 않는다.
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
