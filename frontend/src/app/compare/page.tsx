import type { Metadata } from "next";
import CompareFromStorage from "@/components/CompareFromStorage";
import CompareTable from "@/components/CompareTable";
import { MAX_COMPARE } from "@/lib/compare";
import { fetchAptRent, fetchAptTrade } from "@/lib/data";
import { kstToday } from "@/lib/metrics";
import type { AptRent, AptTrade } from "@/lib/types";

export const metadata: Metadata = {
  title: "단지 비교",
  alternates: { canonical: "/compare" },
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<{ ids?: string }> };

const parseIds = (raw: string | undefined): number[] =>
  [...new Set((raw ?? "").split(",").map(Number))].filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, MAX_COMPARE);

export default async function ComparePage({ searchParams }: Props) {
  const ids = parseIds((await searchParams).ids);
  const loaded = await Promise.all(ids.map((id) => Promise.all([fetchAptTrade(id), fetchAptRent(id)])));
  const found = loaded.filter((p): p is [AptTrade, AptRent | null] => p[0] != null);
  const items = found.map(([t]) => t);
  const rents = found.map(([, r]) => r);
  const today = kstToday(); // 요청마다 서버에서(이 페이지는 동적) — 클라이언트 렌더에서 new Date() 를 부르지 않는다

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">단지 비교</h1>
      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        {ids.length === 0 ? (
          <CompareFromStorage />
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500">비교할 단지를 찾을 수 없습니다</p>
        ) : (
          <CompareTable items={items} rents={rents} today={today} />
        )}
      </section>
    </main>
  );
}
