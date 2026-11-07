import Link from "next/link";
import RegionApartmentList from "@/components/RegionApartmentList";
import type { RegionApartment } from "@/lib/types";

/**
 * 단지 페이지 맨 아래 "같은 동 다른 단지". 서버 컴포넌트라 SSR HTML 에 `<a href="/apartment/N">` 가 그대로 들어간다
 * (크롤러가 단지끼리 이어서 따라갈 수 있게). 같은 동 단지가 모자라면 시군구 단지로 채운 목록을 받는다.
 */
export default function NearbyApartments({
  apartments,
  dong,
  dongHref,
  regionName,
  regionHref,
  sameDong,
}: {
  apartments: RegionApartment[];
  dong: string;
  dongHref: string | null;
  regionName: string;
  regionHref: string;
  sameDong: boolean;
}) {
  if (apartments.length === 0) return null;
  const linkCls = "text-sm font-medium text-blue-600 hover:underline";
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-gray-900">{sameDong ? "같은 동 다른 단지" : `${regionName} 다른 단지`}</h2>
      <RegionApartmentList apartments={apartments} sort="recent" />
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {dongHref && (
          <Link href={dongHref} className={linkCls}>
            {dong} 단지 전체 보기 ›
          </Link>
        )}
        <Link href={regionHref} className={linkCls}>
          {regionName} 전체 보기 ›
        </Link>
      </div>
    </section>
  );
}
