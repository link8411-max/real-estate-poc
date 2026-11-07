import { notFound, permanentRedirect } from "next/navigation";
import ApartmentHeader from "@/components/ApartmentHeader";
import CanceledAlert from "@/components/CanceledAlert";
import CanceledDeals from "@/components/CanceledDeals";
import ApartmentTrades from "@/components/ApartmentTrades";
import AptViewTracker from "@/components/AptViewTracker";
import Breadcrumbs from "@/components/Breadcrumbs";
import DealTabs from "@/components/DealTabs";
import InsightBadges from "@/components/InsightBadges";
import MiniMap from "@/components/MiniMap";
import JsonLd from "@/components/JsonLd";
import RentSection from "@/components/RentSection";
import ShareButton from "@/components/ShareButton";
import { ZoneBadge } from "@/components/ZoneChips";
import { analyzeCanceled, countSince } from "@/lib/canceled";
import { fetchAptRent, fetchAptTrade } from "@/lib/data";
import { areaGroup, areaToPyeong, formatArea, formatPrice } from "@/lib/format";
import { exactLabel, SUPPLY_ENABLED } from "@/lib/supply";
import { kstToday, liveMetrics } from "@/lib/metrics";
import { fetchZoneItems, zonesForApartment } from "@/lib/redevelopment";
import { isMoved } from "@/lib/types";
import { aptCrumbs, aptJsonLd, breadcrumbJsonLd, SITE_URL } from "@/lib/seo";

/** ISR: 첫 요청 때 생성, 한 시간마다 갱신. 최근가·평형별 시세는 서버 HTML에 텍스트로 들어간다. */
export const revalidate = 3600;

/** 빌드 때는 아무것도 만들지 않고, 첫 요청 때 만들어 캐시한다(dynamicParams 기본 true). 이게 있어야 ISR(●)이 된다. */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export default async function ApartmentPage({ params }: Props) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const init = { next: { revalidate } } as RequestInit;
  const [data, rentRaw, zoneItems] = await Promise.all([fetchAptTrade(id, init), fetchAptRent(id, init), fetchZoneItems(init)]);
  if (!data) notFound();
  // 합쳐진 단지: 남은 단지로 영구 이동. 페이지가 ISR 이라 쿼리(?tab=)는 서버에서 볼 수 없다 — 탭은 기본값으로 열린다.
  if (isMoved(data)) permanentRedirect(`/apartment/${data.moved_to}`);

  const rentData = isMoved(rentRaw) ? null : rentRaw;
  const apt = data.apartment;
  const zones = zonesForApartment(zoneItems, apt.id); // 정비구역에 매칭된 단지에만 배지(틀리게 붙이느니 안 붙인다)
  const rent = rentData ?? { apartment: apt, rent_area_stats: [], rents: [] };
  const latest = data.transactions.find((t) => t.cancel_date == null);
  const crumbs = aptCrumbs(apt);
  // 시간 창 지표는 오늘(KST) 기준. 서버에서 한 번 계산해 내려준다 — ISR 이 한 시간마다 갱신.
  const today = kstToday();
  const { canceled, aboveMaxByArea } = analyzeCanceled(data.transactions);
  const recent = countSince(canceled, new Date(Date.parse(today) - 365 * 86_400_000).toISOString().slice(0, 10));
  const metrics = liveMetrics(data, rentData, today);
  const share = {
    title: `${apt.name} 실거래가`,
    description: latest
      ? `최근 매매 ${formatPrice(latest.amount)} (${latest.deal_date}) · ${apt.region_name} ${apt.dong}`
      : `${apt.region_name} ${apt.dong} 아파트 실거래가·전월세`,
    url: `${SITE_URL}/apartment/${apt.id}`,
    imageUrl: `${SITE_URL}/api/og/${apt.id}`,
  };

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <AptViewTracker aptId={apt.id} lawdCd={apt.lawd_cd} />
      <JsonLd data={aptJsonLd(apt)} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <section className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5">
        <ApartmentHeader apartment={apt} actions={<ShareButton aptId={apt.id} meta={share} />} />
        {latest && (
          <p className="text-sm text-gray-700">
            최근 매매 <strong className="text-gray-900">{formatPrice(latest.amount)}</strong>{" "}
            <span className="text-gray-500">
              ({SUPPLY_ENABLED
                ? formatArea(latest.area, "pyeong", exactLabel(apt.area_types, latest.area))
                : `전용 ${areaGroup(latest.area)}㎡·${areaToPyeong(areaGroup(latest.area))}평`}
              , {latest.deal_date})
            </span>
          </p>
        )}
        <InsightBadges metrics={metrics} />
        {zones.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {zones.map((z) => (
              <ZoneBadge key={z.zone_id} zone={z} />
            ))}
          </div>
        )}
        <CanceledAlert total={recent.total} highs={recent.highs} />
      </section>
      {apt.lat != null && apt.lng != null && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-900">위치</h2>
          <MiniMap
            center={{ lat: apt.lat, lng: apt.lng }}
            level={4}
            href={`/map?lat=${apt.lat}&lng=${apt.lng}&level=4`}
            pillLabel="주변 단지 지도로 ›"
            pillTone="light"
            heightClass="h-[160px] md:h-[220px]"
            showHere
            excludeId={apt.id}
          />
        </section>
      )}
      <DealTabs
        empty={{ jeonse: !rent.rents.some((r) => r.monthly_rent === 0), wolse: !rent.rents.some((r) => r.monthly_rent > 0) }}
        panels={{
          trade: latest ? (
            <ApartmentTrades
              stats={data.area_stats}
              transactions={data.transactions}
              canceledAbove={Object.fromEntries(aboveMaxByArea)}
              areaTypes={apt.area_types}
              apt={{ id: apt.id, name: apt.name }}
              today={today}
              beforeList={<CanceledDeals key="canceled" items={canceled} areaTypes={apt.area_types} />}
            />
          ) : (
            <div className="space-y-4">
              <p key="empty" className="rounded-2xl border border-gray-100 bg-white py-12 text-center text-sm text-gray-500">매매 거래가 없습니다</p>
              <CanceledDeals key="canceled" items={canceled} areaTypes={apt.area_types} />
            </div>
          ),
          jeonse: <RentSection rent={rent} tab="jeonse" today={today} />,
          wolse: <RentSection rent={rent} tab="wolse" today={today} />,
        }}
      />
    </main>
  );
}
