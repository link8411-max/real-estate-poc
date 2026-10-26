import type { Metadata } from "next";
import Link from "next/link";
import AreaUnitToggle from "@/components/AreaUnitToggle";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sudogwon.com";
const DESCRIPTION = "서울·경기·인천 아파트 실거래가 조회. 평형별 시세, 전고점 대비, 급매 신호, 지역 통계.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "수도권 아파트 실거래가", template: "%s | 수도권 아파트 실거래가" },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "ko_KR", siteName: "수도권 아파트 실거래가", description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

const NAV = [
  { href: "/", label: "홈" },
  { href: "/map", label: "지도" },
  { href: "/browse", label: "탐색" },
  { href: "/stats", label: "통계" },
  { href: "/compare", label: "비교" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold text-gray-900">
              수도권 실거래가
            </Link>
            <div className="flex items-center gap-4">
              <nav className="flex items-center gap-4 text-sm">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="text-gray-600 hover:text-gray-900">
                    {n.label}
                  </Link>
                ))}
              </nav>
              <AreaUnitToggle />
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
