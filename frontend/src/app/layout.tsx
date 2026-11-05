import type { Metadata } from "next";
import Script from "next/script";
import SiteHeader from "@/components/SiteHeader";
import { GA_ID, gaInitScript } from "@/lib/analytics";
import { HOME_TITLE, SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

const DESCRIPTION = "서울·경기·인천 아파트 실거래가 조회. 평형별 시세, 전고점 대비, 급매 신호, 지역 통계.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: HOME_TITLE, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
  alternates: { types: { "application/rss+xml": [{ url: "/rss.xml", title: "집시세 신고가·취소 소식" }] } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">
        <SiteHeader />
        {children}
        {GA_ID && (
          <Script id="ga4-init" strategy="afterInteractive">
            {gaInitScript(GA_ID)}
          </Script>
        )}
        {/* Vercel Web Analytics — @vercel/analytics 패키지는 vitest 쪽 peer 충돌로 설치가 막혀 공식 스크립트 방식으로 붙인다. */}
        <Script id="vercel-analytics-queue" strategy="afterInteractive">
          {"window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };"}
        </Script>
        <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
