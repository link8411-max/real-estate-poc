"use client";

import Link from "next/link";
import { type AreaUnit, useAreaUnit } from "@/lib/areaUnit";
import { formatArea, formatManwon } from "@/lib/format";
import { liveMetrics, recentWindow } from "@/lib/metrics";
import type { AptRent, AptTrade, AreaStat, Metrics } from "@/lib/types";

const DASH = "—";

/** 거래가 가장 많은 평형 */
const mainArea = (d: AptTrade): AreaStat | undefined =>
  d.area_stats.reduce<AreaStat | undefined>((best, s) => (!best || s.count > best.count ? s : best), undefined);

const won = (n: number | null | undefined) => (n == null ? DASH : formatManwon(n));
const pct = (n: number | undefined) => (n == null ? DASH : `${Math.round(n)}%`);

interface Ctx {
  s: AreaStat | undefined;
  m: Metrics;
  recentAvg: number | null;
  unit: AreaUnit;
}

const ROWS: [string, (d: AptTrade, c: Ctx) => string][] = [
  ["지역", (d) => `${d.apartment.region_name} ${d.apartment.dong}`],
  ["준공", (d) => (d.apartment.build_year == null ? DASH : `${d.apartment.build_year}년`)],
  ["대표 평형", (_, { s, unit }) => (s ? formatArea(s.area, unit) : DASH)],
  ["최근 실거래", (_, { s }) => won(s?.latest_amount)],
  ["최고가", (_, { s }) => won(s?.max_amount)],
  ["최근 3개월 평균", (_, { recentAvg }) => won(recentAvg)],
  ["전고점 회복률", (_, { m }) => pct(m.recovery_rate)],
  ["전세가율", (_, { m }) => pct(m.jeonse_ratio)],
  ["마지막 거래", (_, { m }) => (m.days_since_last_tx == null ? DASH : `${m.days_since_last_tx}일 전`)],
];

/**
 * today: 서버에서 계산한 KST 날짜 "YYYY-MM-DD". 시간 창 지표(3개월 평균·전세가율·경과일)는 거래 배열에서 오늘 기준으로 계산한다.
 * rents: items 와 같은 순서의 전월세 데이터(없으면 전세가율 —).
 */
export default function CompareTable({ items, rents = [], today }: { items: AptTrade[]; rents?: (AptRent | null)[]; today: string }) {
  const [unit] = useAreaUnit();
  const ctxs = items.map((d, i): Ctx => {
    const s = mainArea(d);
    return {
      s,
      m: liveMetrics(d, rents[i] ?? null, today),
      recentAvg: s ? recentWindow(d.transactions, { area: s.area, valueKey: "amount", today }).avg : null,
      unit,
    };
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="w-28 py-3" />
            {items.map((d) => (
              <th key={d.apartment.id} className="px-2 py-3 text-left text-base font-bold text-gray-900">
                <Link href={`/apartment/${d.apartment.id}`} className="hover:text-blue-600">
                  {d.apartment.name}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, get]) => (
            <tr key={label} className="border-b border-gray-50 last:border-b-0">
              <th scope="row" className="py-3 text-left text-xs font-medium text-gray-500">
                {label}
              </th>
              {items.map((d, i) => {
                const v = get(d, ctxs[i]);
                return (
                  <td key={d.apartment.id} className={`px-2 py-3 ${v === DASH ? "text-gray-400" : "text-gray-900"}`}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
