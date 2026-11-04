import { Building2, CalendarDays, Ban, Map as MapIcon, MapPin, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import MiniMap from "@/components/MiniMap";
import RecentDeals from "@/components/RecentDeals";
import SearchBox from "@/components/SearchBox";
import { pickHeadline } from "@/lib/canceled";
import { fetchCanceledRecent, fetchStats } from "@/lib/data";
import { DEFAULT_CENTER, DEFAULT_LEVEL } from "@/lib/mapFilters";
import { kstToday } from "@/lib/metrics";
import { browseHref, CITIES } from "@/lib/regions";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const KEYWORDS = ["잠실", "반포", "래미안", "판교", "ㄹㅁㅇ"];

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">{icon}</div>
      <div>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default async function Home() {
  const stats = await fetchStats();
  const canceled = await fetchCanceledRecent({ next: { revalidate: 3600 } } as RequestInit).catch(() => null);
  const canceledHead = Array.isArray(canceled?.items) ? pickHeadline(canceled.items, kstToday()) : null;
  const districtCount = (city: string) => stats?.regions.filter((r) => r.city === city).length ?? 0;

  return (
    <main className="pb-12">
      <section className="bg-gradient-to-b from-blue-600 to-blue-700 py-14">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h1 className="mb-2 text-3xl font-bold text-white">아파트 실거래가 조회</h1>
          <p className="mb-8 text-blue-100">서울·경기·인천 아파트 실거래 데이터를 검색하세요</p>
          <SearchBox />
          <Link
            href="/map"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-blue-700 shadow-lg transition hover:bg-blue-50"
          >
            <MapIcon className="h-5 w-5" aria-hidden />
            지도에서 찾기
          </Link>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {KEYWORDS.map((k) => (
              <Link
                key={k}
                href={`/search?q=${encodeURIComponent(k)}`}
                className="rounded-full bg-white/20 px-3 py-1.5 text-sm text-white transition hover:bg-white/30"
              >
                {k}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 히어로 바로 아래 미니 지도: /map 기본 화면과 같은 중심·레벨. 조작은 /map에서 */}
      <section className="mx-auto -mt-6 max-w-5xl px-4">
        <MiniMap
          testId="mini-map-card"
          center={DEFAULT_CENTER}
          level={DEFAULT_LEVEL}
          href="/map"
          pillLabel="⤢ 지도 크게 보기"
          pillTone="dark"
          heightClass="h-[180px] md:h-[260px]"
        />
      </section>

      {stats && (
        <section className="mx-auto mt-3 grid max-w-5xl grid-cols-1 gap-3 px-4 sm:grid-cols-3">
          <StatCard
            icon={<Building2 className="h-5 w-5 text-blue-600" />}
            value={stats.total_apartments.toLocaleString("en-US")}
            label="등록 단지"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
            value={stats.recent_transactions_30d.toLocaleString("en-US")}
            label="최근 30일 거래"
          />
          <StatCard
            icon={<CalendarDays className="h-5 w-5 text-blue-600" />}
            value={stats.data_range.max_date ?? "—"}
            label="최신 거래일"
          />
          {canceledHead && canceledHead.items.length > 0 && (
            <Link href="/canceled" className="block sm:col-span-3">
              <StatCard icon={<Ban className="h-5 w-5 text-rose-600" />} value={`${canceledHead.items.length}건`} label={`최근 ${canceledHead.days}일 취소된 신고가`} />
            </Link>
          )}
        </section>
      )}

      <section className="mx-auto max-w-5xl px-4 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">지역별 탐색</h2>
          <Link href="/browse" className="text-sm text-blue-600 hover:underline">
            전체보기
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {CITIES.map((city) => (
            <Link
              key={city}
              href={browseHref(city)}
              className="rounded-xl border border-gray-100 bg-white p-4 text-center transition hover:border-blue-200 hover:shadow-md"
            >
              <MapPin className="mx-auto mb-2 h-5 w-5 text-blue-600" aria-hidden />
              <p className="font-semibold text-gray-900">{city}</p>
              {stats && <p className="text-xs text-gray-500">{districtCount(city)}개 시·구</p>}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pt-8">
        <h2 className="mb-4 text-lg font-bold text-gray-900">최근 거래</h2>
        <RecentDeals deals={stats?.recent ?? []} />
      </section>
    </main>
  );
}
