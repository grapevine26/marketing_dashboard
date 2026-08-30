import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Influencer Marketing Platform (MVP)",
  description: "통합 인플루언서 시딩 및 마케팅 관리 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased flex flex-col">{children}</body>
    </html>
  );
}
