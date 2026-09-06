import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "마케팅 올인원 | 통합 인플루언서 & 마케팅 플랫폼",
  description: "인플루언서 시딩, 오프라인 VIP 행사, 공식 SNS 채널 통합 관리 솔루션",
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
    <html lang="ko" className="dark" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased flex flex-col selection:bg-purple-600 selection:text-white font-sans">
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
