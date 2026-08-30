import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "마케팅 올인원 | 통합 인플루언서 & 마케팅 플랫폼",
  description: "인플루언서 시딩, 오프라인 VIP 행사, 공식 SNS 채널 통합 관리 솔루션",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#090A0C",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="min-h-screen bg-[#090A0C] text-zinc-100 antialiased flex flex-col selection:bg-blue-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}