import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#121316",
};

// 첫 페인트 전에 테마 클래스를 결정해 깜빡임을 막는다 (ThemeProvider.resolveInitialTheme와 동일 로직).
const themeInitScript = `
(function(){try{var s=localStorage.getItem("marketing_theme");var t=(s==="light"||s==="dark")?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");var r=document.documentElement;r.classList.remove("dark","light");r.classList.add(t);r.setAttribute("data-theme",t);}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`dark ${brand.variable}`} data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased flex flex-col selection:bg-accent selection:text-accent-on font-sans">
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
        <ThemeProvider>
          {children}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}
