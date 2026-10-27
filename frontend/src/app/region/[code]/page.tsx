import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import RegionApartmentList from "@/components/RegionApartmentList";
import { fetchRegion, fetchStats } from "@/lib/data";
import { browseHref, districtFullName, regionHref, resolveRegionCode } from "@/lib/regions";
import { breadcrumbJsonLd, type Crumb, regionDescription, regionTitle, shortPrice } from "@/lib/seo";

/** 지역 파일은 하루 한 번 바뀐다. 첫 요청 때 만들고 한 시간마다 갱신. */
export const revalidate = 3600;

/** 빌드 때는 아무것도 만들지 않고, 첫 요청 때 만들어 캐시한다(dynamicParams 기본 true). 이게 있어야 ISR(●)이 된다. */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ code: string }> };

const init = { next: { revalidate } } as RequestInit;

async function load(code: string) {
  const [region, stats] = await Promise.all([fetchRegion(code, init), fetchStats(init)]);
  return region ? { region, stat: stats?.regions.find((r) => r.code === code) } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const route = resolveRegionCode((await params).code);
  const data = route.kind === "ok" ? await load(route.code) : null;
  if (!data) return { title: "지역을 찾을 수 없습니다", robots: { index: false } };
  const { region, stat } = data;
  const title = regionTitle(region);
  const description = regionDescription(region, region.apartments.length, stat);
  const url = regionHref(region.code);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
  };
}

export default async function RegionPage({ params }: Props) {
  const route = resolveRegionCode((await params).code);
  if (route.kind === "redirect") permanentRedirect(regionHref(route.code));
  if (route.kind === "notFound") notFound();
  const data = await load(route.code);
  if (!data) notFound();

  const { region, stat } = data;
  const name = districtFullName(region.code) || region.name;
  const crumbs: Crumb[] = [
    { name: "홈", url: "/" },
    { name: region.city, url: browseHref(region.city) },
    { name, url: regionHref(region.code) },
  ];
  const facts = [
    `단지 ${region.apartments.length.toLocaleString("en-US")}개`,
    stat?.avg_amount != null && `최근 12개월 평균 ${shortPrice(stat.avg_amount)}`,
    stat && `거래 ${stat.tx_count_12m.toLocaleString("en-US")}건`,
    stat?.yoy_change != null && `전년 대비 ${stat.yoy_change > 0 ? "+" : ""}${stat.yoy_change}%`,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">{name} 아파트 실거래가</h1>
        <p className="text-sm text-gray-600">
          {region.city} {name} · {facts.join(" · ")}
        </p>
      </header>
      <section>
        <h2 className="mb-3 text-lg font-bold text-gray-900">단지 목록 <span className="text-sm font-normal text-gray-500">거래 많은 순</span></h2>
        <RegionApartmentList apartments={region.apartments} />
      </section>
    </main>
  );
}
