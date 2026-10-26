import { TrendingDown, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import RegionStatsTable, { isRegionSort, REGION_SORTS, type RegionSort } from "@/components/RegionStatsTable";
import { fetchStats } from "@/lib/data";
import type { RegionStat } from "@/lib/types";

export const metadata: Metadata = { title: "지역 통계" };

type Props = { searchParams: Promise<{ sort?: string }> };

function Movers({ title, icon, items }: { title: string; icon: React.ReactNode; items: RegionStat[] }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-gray-900">
        {icon}
        {title}
      </h2>
      <ol className="space-y-2 text-sm">
        {items.map((r, i) => (
          <li key={r.code} className="flex justify-between">
            <span className="text-gray-700">
              {i + 1}. {r.city} {r.name}
            </span>
            <span className={(r.yoy_change ?? 0) >= 0 ? "text-red-500" : "text-blue-500"}>
              {r.yoy_change == null ? "—" : `${r.yoy_change > 0 ? "+" : ""}${r.yoy_change.toFixed(1)}%`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function StatsPage({ searchParams }: Props) {
  const { sort: sortParam } = await searchParams;
  const sort: RegionSort = isRegionSort(sortParam) ? sortParam : "avg_desc";
  const stats = await fetchStats();

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">지역 통계</h1>
        {stats && (
          <p className="mt-1 text-sm text-gray-500">
            최근 12개월 기준 · 데이터 {stats.data_range.min_date} ~ {stats.data_range.max_date}
          </p>
        )}
      </div>

      {!stats ? (
        <p className="py-10 text-center text-sm text-gray-500">통계 데이터가 없습니다</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Movers title="상승 상위" icon={<TrendingUp className="h-5 w-5 text-red-500" />} items={stats.top_up} />
            <Movers title="하락 상위" icon={<TrendingDown className="h-5 w-5 text-blue-500" />} items={stats.top_down} />
          </div>

          <section className="rounded-2xl border border-gray-100 bg-white p-5">
            <nav className="mb-4 flex flex-wrap gap-2" aria-label="정렬">
              {(Object.keys(REGION_SORTS) as RegionSort[]).map((key) => (
                <Link
                  key={key}
                  href={`/stats?sort=${key}`}
                  scroll={false}
                  aria-current={key === sort ? "true" : undefined}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    key === sort ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {REGION_SORTS[key]}
                </Link>
              ))}
            </nav>
            <RegionStatsTable regions={stats.regions} sort={sort} />
          </section>
        </>
      )}
    </main>
  );
}
