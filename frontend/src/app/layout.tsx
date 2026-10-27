import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

const DESCRIPTION = "서울·경기·인천 아파트 실거래가 조회. 평형별 시세, 전고점 대비, 급매 신호, 지역 통계.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
