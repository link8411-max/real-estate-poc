"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAreaUnit } from "@/lib/areaUnit";
import { formatArea, formatDeal, formatPrice } from "@/lib/format";
import { topByPct } from "@/lib/highs";
import type { RecordHigh } from "@/lib/types";

const DISCLAIMER = "신고가는 같은 단지·같은 평형의 이전 계약 중 최고가보다 높은 거래입니다(계약일 기준, 취소된 거래 제외). 신고 지연으로 건수가 늘 수 있습니다. 국토교통부 실거래가 공개 자료 기준.";
const CITY_FILTERS = ["전체", "서울", "경기", "인천"] as const;
type CityFilter = (typeof CITY_FILTERS)[number];

const href = (i: RecordHigh) => `/apartment/${i.apt_id}`;
const pill = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-medium transition ${on ? "bg-rose-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`;

export default function HighsBoard({ items }: { items: RecordHigh[] }) {
  const [unit] = useAreaUnit();
  const [city, setCity] = useState<CityFilter>("전체");

  const shown = useMemo(
    () =>
      items
        .filter((i) => city === "전체" || i.city === city)
        .sort((a, b) => b.deal_date.localeCompare(a.deal_date) || b.jump_pct - a.jump_pct),
    [items, city],
  );
  const top = useMemo(() => topByPct(shown, 3), [shown]);

  const scope = city === "전체" ? "" : `${city} `;
  const headline = shown.length === 0 ? `최근 30일 ${scope}신고가가 없습니다` : `최근 30일 ${scope}신고가 ${shown.length}건`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="rounded-2xl bg-rose-50 p-6">
        <h1 className="text-2xl font-extrabold text-rose-600 sm:text-3xl">{headline}</h1>
      </div>

      <div role="group" aria-label="지역" className="flex gap-2">
        {CITY_FILTERS.map((c) => (
          <button key={c} aria-pressed={city === c} onClick={() => setCity(c)} className={pill(city === c)}>
            {c}
          </button>
        ))}
      </div>

      {top.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-3">
          {top.map((i) => (
            <Link
              key={i.tx_id}
              data-testid="top-card"
              href={href(i)}
              className="block rounded-2xl border border-rose-100 bg-rose-50 p-5 transition hover:border-rose-300 hover:shadow-md"
            >
              <p className="text-sm font-semibold text-gray-900">
                {i.apt_name} {formatArea(i.area, unit)}
              </p>
              <p className="my-2 text-3xl font-extrabold text-rose-600">+{i.jump_pct}%</p>
              <p className="text-sm text-gray-600">{formatPrice(i.amount)}</p>
            </Link>
          ))}
        </section>
      )}

      {shown.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5">
          <ul className="space-y-3 md:hidden">
            {shown.map((i) => (
              <li key={i.tx_id} data-testid="high-row">
                <Link href={href(i)} className="block rounded-xl border border-gray-100 p-3 hover:bg-gray-50">
                  <p className="font-semibold text-gray-900">{i.apt_name}</p>
                  <p className="text-xs text-gray-500">
                    {i.region_name} · {formatArea(i.area, unit)}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-bold text-rose-600">{formatPrice(i.amount)}</span>
                    <span className="ml-1 font-semibold text-rose-500">+{i.jump_pct}%</span>
                    <span className="text-gray-500"> (직전 최고가 {formatPrice(i.prev_max)})</span>
                  </p>
                  <p className="text-xs text-gray-500">계약 {formatDeal(i.deal_date)}</p>
                </Link>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="py-2 font-medium">단지·지역</th>
                <th className="py-2 font-medium">평형</th>
                <th className="py-2 text-right font-medium">신고가</th>
                <th className="py-2 text-right font-medium">상승률</th>
                <th className="py-2 text-right font-medium">직전 최고가</th>
                <th className="py-2 text-right font-medium">계약일</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.tx_id} data-testid="high-row" className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2">
                    <Link href={href(i)} className="font-semibold text-gray-900 hover:underline">
                      {i.apt_name}
                    </Link>
                    <span className="ml-2 text-xs text-gray-500">{i.region_name}</span>
                  </td>
                  <td className="py-2 text-gray-700">{formatArea(i.area, unit)}</td>
                  <td className="py-2 text-right font-bold text-rose-600">{formatPrice(i.amount)}</td>
                  <td className="py-2 text-right font-semibold text-rose-500">+{i.jump_pct}%</td>
                  <td className="py-2 text-right text-gray-700">{formatPrice(i.prev_max)}</td>
                  <td className="py-2 text-right text-gray-500">{formatDeal(i.deal_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs text-gray-500">{DISCLAIMER}</p>
    </main>
  );
}
