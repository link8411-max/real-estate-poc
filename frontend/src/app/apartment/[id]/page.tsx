import { notFound } from "next/navigation";
import ApartmentHeader from "@/components/ApartmentHeader";
import ApartmentTrades from "@/components/ApartmentTrades";
import InsightBadges from "@/components/InsightBadges";
import { fetchAptTrade } from "@/lib/data";

type Props = { params: Promise<{ id: string }> };

export default async function ApartmentPage({ params }: Props) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const data = await fetchAptTrade(id);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <section className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5">
        <ApartmentHeader apartment={data.apartment} />
        <InsightBadges metrics={data.metrics} />
      </section>
      <ApartmentTrades stats={data.area_stats} transactions={data.transactions} />
    </main>
  );
}
