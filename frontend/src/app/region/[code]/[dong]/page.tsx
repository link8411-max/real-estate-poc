import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import MiniMap from "@/components/MiniMap";
import RecentHighsSection from "@/components/RecentHighsSection";
import RegionApartmentList from "@/components/RegionApartmentList";
import { fetchRegion } from "@/lib/data";
import { fetchHighItems, recentHighsFor } from "@/lib/highs";
import { regionHref, resolveRegionCode } from "@/lib/regions";
import { breadcrumbJsonLd, dongCrumbs, dongDescription, dongFromParam, dongHref, dongIntro, dongTitle } from "@/lib/seo";

/** 지역 파일은 하루 한 번 바뀐다. 첫 요청 때 만들고 한 시간마다 갱신. */
export const revalidate = 3600;

/** 빌드 때는 아무것도 만들지 않고, 첫 요청 때 만들어 캐시한다. 이게 있어야 ISR(●)이 된다. */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ code: string; dong: string }> };

const init = { next: { revalidate } } as RequestInit;

/** 지역 JSON에서 그 동 단지만 고른다. 지역이 없거나 동에 단지가 없으면 null */
async function load(code: string, dong: string) {
  const [region, highs] = await Promise.all([fetchRegion(code, init), fetchHighItems(init)]);
  const apartments = region?.apartments.filter((a) => a.dong === dong) ?? [];
  return region && apartments.length > 0 ? { region, apartments, highs: recentHighsFor(highs, code, dong) } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const route = resolveRegionCode(p.code);
  const dong = dongFromParam(p.dong);
  const data = route.kind === "ok" ? await load(route.code, dong) : null;
  if (!data) return { title: "동을 찾을 수 없습니다", robots: { index: false } };
  const title = dongTitle(data.region, dong);
  const description = dongDescription(data.region, dong, data.apartments);
  const url = dongHref(data.region.code, dong);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
  };
}

export default async function DongPage({ params }: Props) {
  const p = await params;
  const route = resolveRegionCode(p.code);
  // 폐지 코드: 후속 구에 같은 동이 있다는 보장이 없어 구 페이지로 보낸다
  if (route.kind === "redirect") permanentRedirect(regionHref(route.code));
  if (route.kind === "notFound") notFound();
  const dong = dongFromParam(p.dong);
  const data = await load(route.code, dong);
  if (!data) notFound();

  const { region, apartments, highs } = data;
  const crumbs = dongCrumbs(region, dong);

  // 좌표 있는 단지의 평균 위치가 지도 중심. 하나도 없으면 지도를 그리지 않는다.
  const located = apartments.filter((a) => a.lat != null && a.lng != null);
  const center = located.length
    ? {
        lat: +(located.reduce((s, a) => s + (a.lat as number), 0) / located.length).toFixed(5),
        lng: +(located.reduce((s, a) => s + (a.lng as number), 0) / located.length).toFixed(5),
      }
    : null;

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">{dong} 아파트 실거래가</h1>
        <p className="text-sm text-gray-600">{dongIntro(region, dong, apartments)}</p>
      </header>
      {center && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-900">위치</h2>
          <MiniMap
            center={center}
            level={5}
            href={`/map?lat=${center.lat}&lng=${center.lng}&level=5`}
            pillLabel="지도로 보기 ›"
            pillTone="light"
            heightClass="h-[160px] md:h-[220px]"
          />
        </section>
      )}
      <RecentHighsSection items={highs} />
      <section>
        <h2 className="mb-3 text-lg font-bold text-gray-900">
          단지 목록 <span className="text-sm font-normal text-gray-500">최근 거래순</span>
        </h2>
        <RegionApartmentList apartments={apartments} sort="recent" showJeonse />
      </section>
    </main>
  );
}
