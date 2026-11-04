"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { pickHeadline, toIsoDate, topJumps } from "@/lib/canceled";
import { useAreaUnit } from "@/lib/areaUnit";
import { formatArea, formatDeal, formatPrice } from "@/lib/format";
import type { CanceledHigh } from "@/lib/types";

const DISCLAIMER = "거래 해제는 대출 불발·계약 합의 해지 등 여러 이유로 생깁니다. 국토교통부 실거래가 공개 자료 기준.";
const CITY_FILTERS = ["전체", "서울", "경기", "인천"] as const;
type CityFilter = (typeof CITY_FILTERS)[number];
const PERIODS = [7, 30] as const;

const href = (i: CanceledHigh) => `/canceled/${i.apt_id}/${i.tx_id}`;
const pill = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-medium transition ${on ? "bg-rose-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`;

export default function CanceledBoard({ items, today }: { items: CanceledHigh[]; today: string }) {
  const [unit] = useAreaUnit();
  const [days, setDays] = useState<7 | 30>(() => pickHeadline(items, today).days);
  const [city, setCity] = useState<CityFilter>("전체");

  const shown = useMemo(() => {
    const since = new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);
    return items
      .filter((i) => toIsoDate(i.cancel_date) >= since && (city === "전체" || i.city === city))
      .sort((a, b) => (a.cancel_date < b.cancel_date ? 1 : a.cancel_date > b.cancel_date ? -1 : 0));
  }, [items, today, days, city]);
  const top = useMemo(() => topJumps(shown, 3), [shown]);

  const headline = shown.length === 0 && days === 30 && city === "전체" ? "최근 30일 취소된 신고가가 없습니다" : `최근 ${days}일, 신고가 ${shown.length}건이 신고 후 취소됐습니다`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="rounded-2xl bg-rose-50 p-6">
        <h1 className="text-2xl font-extrabold text-rose-600 sm:text-3xl">{headline}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="tablist" aria-label="기간" className="flex gap-2">
          {PERIODS.map((p) => (
            <button key={p} role="tab" aria-selected={days === p} onClick={() => setDays(p)} className={pill(days === p)}>
              {p}일
            </button>
          ))}
        </div>
        <div role="group" aria-label="지역" className="flex gap-2">
          {CITY_FILTERS.map((c) => (
            <button key={c} aria-pressed={city === c} onClick={() => setCity(c)} className={pill(city === c)}>
              {c}
            </button>
          ))}
        </div>
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
              <p className="my-2 text-3xl font-extrabold text-rose-600">+{formatPrice(i.jump)}</p>
              <p className="text-sm text-gray-600">{i.days_to_cancel}일 만에 취소</p>
            </Link>
          ))}
        </section>
      )}

      {shown.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5">
          <ul className="space-y-3 md:hidden">
            {shown.map((i) => (
              <li key={i.tx_id}>
                <Link href={href(i)} className="block rounded-xl border border-gray-100 p-3 hover:bg-gray-50">
                  <p className="font-semibold text-gray-900">{i.apt_name}</p>
                  <p className="text-xs text-gray-500">
                    {i.city} {i.region_name} · {formatArea(i.area, unit)}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-bold text-rose-600">{formatPrice(i.amount)}</span>
                    <span className="text-gray-500"> (직전 최고가 {formatPrice(i.prev_max)})</span>
                  </p>
                  <p className="text-xs text-gray-500">해제 {formatDeal(toIsoDate(i.cancel_date))}</p>
                </Link>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="py-2 font-medium">단지·지역</th>
                <th className="py-2 font-medium">평형</th>
                <th className="py-2 text-right font-medium">취소된 가격</th>
                <th className="py-2 text-right font-medium">직전 최고가</th>
                <th className="py-2 text-right font-medium">해제일</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.tx_id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2">
                    <Link href={href(i)} className="font-semibold text-gray-900 hover:underline">
                      {i.apt_name}
                    </Link>
                    <span className="ml-2 text-xs text-gray-500">
                      {i.city} {i.region_name}
                    </span>
                  </td>
                  <td className="py-2 text-gray-700">{formatArea(i.area, unit)}</td>
                  <td className="py-2 text-right font-bold text-rose-600">{formatPrice(i.amount)}</td>
                  <td className="py-2 text-right text-gray-700">{formatPrice(i.prev_max)}</td>
                  <td className="py-2 text-right text-gray-500">{formatDeal(toIsoDate(i.cancel_date))}</td>
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
