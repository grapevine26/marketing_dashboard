import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "마케팅 올인원 | 통합 인플루언서 & 마케팅 플랫폼",
  description: "인플루언서 시딩, 오프라인 VIP 행사, 공식 SNS 채널 통합 관리 솔루션",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#121316",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-[#121316] text-zinc-100 antialiased flex flex-col selection:bg-purple-600 selection:text-white font-sans">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}