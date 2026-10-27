import { notFound } from "next/navigation";
import ApartmentHeader from "@/components/ApartmentHeader";
import ApartmentTrades from "@/components/ApartmentTrades";
import Breadcrumbs from "@/components/Breadcrumbs";
import DealTabs from "@/components/DealTabs";
import InsightBadges from "@/components/InsightBadges";
import JsonLd from "@/components/JsonLd";
import RentSection from "@/components/RentSection";
import { fetchAptRent, fetchAptTrade } from "@/lib/data";
import { areaGroup, areaToPyeong, formatPrice } from "@/lib/format";
import { kstToday, liveMetrics } from "@/lib/metrics";
import { aptCrumbs, aptJsonLd, breadcrumbJsonLd } from "@/lib/seo";

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
  const [data, rentData] = await Promise.all([fetchAptTrade(id, init), fetchAptRent(id, init)]);
  if (!data) notFound();

  const apt = data.apartment;
  const rent = rentData ?? { apartment: apt, rent_area_stats: [], rents: [] };
  const latest = data.transactions.find((t) => t.cancel_date == null);
  const crumbs = aptCrumbs(apt);
  // 시간 창 지표는 오늘(KST) 기준. 서버에서 한 번 계산해 내려준다 — ISR 이 한 시간마다 갱신.
  const today = kstToday();
  const metrics = liveMetrics(data, rentData, today);

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <JsonLd data={aptJsonLd(apt)} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <section className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5">
        <ApartmentHeader apartment={apt} />
        {latest && (
          <p className="text-sm text-gray-700">
            최근 매매 <strong className="text-gray-900">{formatPrice(latest.amount)}</strong>{" "}
            <span className="text-gray-500">
              (전용 {areaGroup(latest.area)}㎡·{areaToPyeong(areaGroup(latest.area))}평, {latest.deal_date})
            </span>
          </p>
        )}
        <InsightBadges metrics={metrics} />
      </section>
      <DealTabs
        empty={{ jeonse: !rent.rents.some((r) => r.monthly_rent === 0), wolse: !rent.rents.some((r) => r.monthly_rent > 0) }}
        panels={{
          trade: latest ? (
            <ApartmentTrades stats={data.area_stats} transactions={data.transactions} />
          ) : (
            <p className="rounded-2xl border border-gray-100 bg-white py-12 text-center text-sm text-gray-500">매매 거래가 없습니다</p>
          ),
          jeonse: <RentSection rent={rent} tab="jeonse" today={today} />,
          wolse: <RentSection rent={rent} tab="wolse" today={today} />,
        }}
      />
    </main>
  );
}
