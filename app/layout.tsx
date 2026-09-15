import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastContainer } from "@/components/Toast";

/**
 * 브랜드 글꼴(Inter ExtraBold). 로고 워드마크에만 쓴다.
 *
 * 파일을 저장소에 두고 앱에 같이 담는다. 외부에 요청을 보내지 않으니 네트워크가 막힌 곳에서도
 * 같게 보이고, 글자가 늦게 바뀌며 깜빡이는 일도 없다. 영문 구간만 담은 파일이라 가볍다.
 * 아이콘은 같은 글꼴의 ttf 를 lib/brand-font.ts 에서 따로 읽는다. 그리는 방식이 달라서다.
 */
const brand = localFont({
  src: "./fonts/Inter-ExtraBold-latin.woff2",
  weight: "800",
  style: "normal",
  display: "swap",
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: "RB Global | 인플루언서 마케팅 & 올인원 캠페인 운영",
  description: "인플루언서 시딩, 오프라인 행사, 공식 SNS 채널을 한곳에 모아 운영하는 RB Global 마케팅 통합 플랫폼",
  applicationName: "RB Global",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RB Global",
  },
  // icons 를 여기에 적지 않는다. app/icon.tsx 와 app/apple-icon.tsx 가 있으면
  // Next 가 알아서 링크를 넣는다. 두 곳에 적으면 한쪽만 고치는 사고가 난다.
};

/**
 * 모든 페이지를 요청마다 렌더한다.
 *
 * CSP 난수는 요청마다 달라야 하는데, 정적으로 미리 만들어 둔 HTML 에는 그 요청의 난수를
 * 넣을 수 없다. 그대로 두면 미리 만들어진 페이지(/signup, 404 화면)만 스크립트가 전부 막혀
 * 죽은 화면이 된다. proxy.ts / lib/security/csp.ts 참고.
 *
 * 잃는 것: 정적으로 굳힐 수 있던 페이지가 /signup 과 오류 화면뿐이었고, 쓰는 사람이 몇 명인
 * 사내 도구라 사실상 없다.
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#121316",
};

// 첫 페인트 전에 테마 클래스를 결정해 깜빡임을 막는다 (ThemeProvider.resolveInitialTheme와 동일 로직).
const themeInitScript = `
(function(){try{var s=localStorage.getItem("marketing_theme");var t=(s==="light"||s==="dark")?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");var r=document.documentElement;r.classList.remove("dark","light");r.classList.add(t);r.setAttribute("data-theme",t);}catch(e){}})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // CSP 난수를 proxy.ts 가 요청 헤더에 실어 보낸다. Next 가 자기 스크립트에는 알아서 붙이지만,
  // 이 <Script> 에는 직접 넘겨야 한다. 안 넘기면 서버는 난수를 달고 클라이언트는 빈 값으로 그려
  // 개발 모드에서 하이드레이션 불일치 경고가 뜬다(배포에서는 동작에 문제가 없지만 로그가 지저분해진다).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="ko" className={`dark ${brand.variable}`} data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased flex flex-col selection:bg-accent selection:text-accent-on font-sans">
        <Script id="theme-init" strategy="beforeInteractive" nonce={nonce}>{themeInitScript}</Script>
        <ThemeProvider>
          {children}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}
