import Link from "next/link";
import { formatArea, formatManwon } from "@/lib/format";
import type { AptTrade, AreaStat } from "@/lib/types";

const DASH = "—";

/** 거래가 가장 많은 평형 */
const mainArea = (d: AptTrade): AreaStat | undefined =>
  d.area_stats.reduce<AreaStat | undefined>((best, s) => (!best || s.count > best.count ? s : best), undefined);

const won = (n: number | null | undefined) => (n == null ? DASH : formatManwon(n));
const pct = (n: number | undefined) => (n == null ? DASH : `${Math.round(n)}%`);

const ROWS: [string, (d: AptTrade, s: AreaStat | undefined) => string][] = [
  ["지역", (d) => `${d.apartment.region_name} ${d.apartment.dong}`],
  ["준공", (d) => (d.apartment.build_year == null ? DASH : `${d.apartment.build_year}년`)],
  ["대표 평형", (_, s) => (s ? formatArea(s.area) : DASH)],
  ["최근 실거래", (_, s) => won(s?.latest_amount)],
  ["최고가", (_, s) => won(s?.max_amount)],
  ["최근 1년 평균", (_, s) => won(s?.recent_avg)],
  ["전고점 회복률", (d) => pct(d.metrics.recovery_rate)],
  ["전세가율", (d) => pct(d.metrics.jeonse_ratio)],
  ["마지막 거래", (d) => (d.metrics.days_since_last_tx == null ? DASH : `${d.metrics.days_since_last_tx}일 전`)],
];

export default function CompareTable({ items }: { items: AptTrade[] }) {
  const mains = items.map(mainArea);
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
                const v = get(d, mains[i]);
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
