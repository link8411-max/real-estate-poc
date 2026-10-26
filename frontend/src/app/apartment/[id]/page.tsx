import { notFound } from "next/navigation";
import { Suspense } from "react";
import ApartmentHeader from "@/components/ApartmentHeader";
import ApartmentTrades from "@/components/ApartmentTrades";
import DealTabs from "@/components/DealTabs";
import InsightBadges from "@/components/InsightBadges";
import RentSection from "@/components/RentSection";
import { fetchAptRent, fetchAptTrade } from "@/lib/data";

type Props = { params: Promise<{ id: string }> };

export default async function ApartmentPage({ params }: Props) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [data, rentData] = await Promise.all([fetchAptTrade(id), fetchAptRent(id)]);
  if (!data) notFound();

  const rent = rentData ?? { apartment: data.apartment, rent_area_stats: [], rents: [] };
  const hasTrade = data.transactions.some((t) => t.cancel_date == null);

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <section className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5">
        <ApartmentHeader apartment={data.apartment} />
        <InsightBadges metrics={data.metrics} />
      </section>
      <Suspense>
        <DealTabs
          empty={{ jeonse: !rent.rents.some((r) => r.monthly_rent === 0), wolse: !rent.rents.some((r) => r.monthly_rent > 0) }}
          panels={{
            trade: hasTrade ? (
              <ApartmentTrades stats={data.area_stats} transactions={data.transactions} />
            ) : (
              <p className="rounded-2xl border border-gray-100 bg-white py-12 text-center text-sm text-gray-500">매매 거래가 없습니다</p>
            ),
            jeonse: <RentSection rent={rent} tab="jeonse" />,
            wolse: <RentSection rent={rent} tab="wolse" />,
          }}
        />
      </Suspense>
    </main>
  );
}
