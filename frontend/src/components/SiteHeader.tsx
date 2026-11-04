import Link from "next/link";
import AreaUnitToggle from "@/components/AreaUnitToggle";
import { SITE_NAME } from "@/lib/seo";

export const NAV = [
  { href: "/", label: "홈" },
  { href: "/map", label: "지도" },
  { href: "/browse", label: "탐색" },
  { href: "/canceled", label: "취소된 신고가" },
  { href: "/stats", label: "통계" },
  { href: "/compare", label: "비교" },
];

/** 모바일: 제목+단위 토글 한 줄, 메뉴는 아래 줄(가로 스크롤). 데스크톱(md+): 한 줄. */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" aria-label={`${SITE_NAME} 홈`} className="mr-auto flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-lg font-bold text-gray-900">{SITE_NAME}</span>
          <span className="text-xs text-gray-500">수도권 실거래가</span>
        </Link>
        <div className="order-2 md:order-3">
          <AreaUnitToggle />
        </div>
        <nav className="order-3 flex basis-full items-center gap-4 overflow-x-auto text-sm md:order-2 md:basis-auto md:overflow-visible">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap text-gray-600 hover:text-gray-900">
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
