import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import RegionBrowser from "@/components/RegionBrowser";
import { fetchStats } from "@/lib/data";
import { browseHref, CITIES, regionHref, resolveRegionCode } from "@/lib/regions";

type Props = { searchParams: Promise<{ city?: string; region?: string }> };

const pickCity = (raw: string | undefined) => CITIES.find((c) => c === raw) ?? CITIES[0];

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const city = pickCity((await searchParams).city);
  return {
    title: `${city} 지역 탐색`,
    description: `${city} 시군구별 아파트 실거래가. 지역을 고르면 단지 목록과 최근 거래가를 볼 수 있습니다.`,
    alternates: { canonical: city === CITIES[0] ? "/browse" : browseHref(city) },
  };
}

export default async function BrowsePage({ searchParams }: Props) {
  const { city: cityParam, region } = await searchParams;
  // 예전 /browse?region=X 링크는 경로형 지역 페이지로 옮겼다.
  if (region) {
    const r = resolveRegionCode(region);
    if (r.kind !== "notFound") permanentRedirect(regionHref(r.code));
  }
  const stats = await fetchStats();
  const city = pickCity(cityParam);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">지역 탐색</h1>
      <RegionBrowser regions={stats?.regions ?? []} city={city} />
    </main>
  );
}
