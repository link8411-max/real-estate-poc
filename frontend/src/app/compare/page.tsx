import type { Metadata } from "next";
import CompareFromStorage from "@/components/CompareFromStorage";
import CompareTable from "@/components/CompareTable";
import { MAX_COMPARE } from "@/lib/compare";
import { fetchAptTrade } from "@/lib/data";
import type { AptTrade } from "@/lib/types";

export const metadata: Metadata = { title: "단지 비교" };

type Props = { searchParams: Promise<{ ids?: string }> };

const parseIds = (raw: string | undefined): number[] =>
  [...new Set((raw ?? "").split(",").map(Number))].filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, MAX_COMPARE);

export default async function ComparePage({ searchParams }: Props) {
  const ids = parseIds((await searchParams).ids);
  const items = (await Promise.all(ids.map((id) => fetchAptTrade(id)))).filter((d): d is AptTrade => d != null);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">단지 비교</h1>
      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        {ids.length === 0 ? (
          <CompareFromStorage />
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500">비교할 단지를 찾을 수 없습니다</p>
        ) : (
          <CompareTable items={items} />
        )}
      </section>
    </main>
  );
}
