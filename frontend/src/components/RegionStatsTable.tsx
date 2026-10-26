import Link from "next/link";
import { formatManwon } from "@/lib/format";
import { browseHref } from "@/lib/regions";
import type { RegionStat } from "@/lib/types";

export const REGION_SORTS = {
  name: "이름순",
  avg_desc: "평균가 높은순",
  avg_asc: "평균가 낮은순",
  count_desc: "거래 많은순",
  count_asc: "거래 적은순",
  yoy_desc: "상승률순",
  yoy_asc: "하락률순",
} as const;

export type RegionSort = keyof typeof REGION_SORTS;

export const isRegionSort = (s: unknown): s is RegionSort => typeof s === "string" && s in REGION_SORTS;

type NumKey = "avg_amount" | "tx_count_12m" | "yoy_change";
const SORT_SPEC: Record<Exclude<RegionSort, "name">, [NumKey, 1 | -1]> = {
  avg_desc: ["avg_amount", -1],
  avg_asc: ["avg_amount", 1],
  count_desc: ["tx_count_12m", -1],
  count_asc: ["tx_count_12m", 1],
  yoy_desc: ["yoy_change", -1],
  yoy_asc: ["yoy_change", 1],
};

const byName = (a: RegionStat, b: RegionStat) => a.name.localeCompare(b.name, "ko");

/** 정렬. 값이 없는(null) 지역은 방향과 상관없이 항상 뒤로, 동률은 이름순. */
export function sortRegions(regions: RegionStat[], sort: RegionSort): RegionStat[] {
  if (sort === "name") return [...regions].sort(byName);
  const [key, dir] = SORT_SPEC[sort];
  return [...regions].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null || y == null) return x == null && y == null ? byName(a, b) : x == null ? 1 : -1;
    return (x - y) * dir || byName(a, b);
  });
}

function Yoy({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400">—</span>;
  const cls = value > 0 ? "text-red-500" : value < 0 ? "text-blue-500" : "text-gray-500";
  return <span className={cls}>{`${value > 0 ? "+" : ""}${value.toFixed(1)}%`}</span>;
}

export default function RegionStatsTable({ regions, sort }: { regions: RegionStat[]; sort: RegionSort }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="py-2 pr-3 font-medium">지역</th>
            <th className="py-2 pr-3 text-right font-medium">평균 매매가</th>
            <th className="py-2 pr-3 text-right font-medium">12개월 거래</th>
            <th className="py-2 text-right font-medium">전년 대비</th>
          </tr>
        </thead>
        <tbody>
          {sortRegions(regions, sort).map((r) => (
            <tr key={r.code} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
              <th scope="row" className="py-3 pr-3 text-left font-semibold text-gray-900">
                <Link href={browseHref(r.city, r.code)} className="hover:text-blue-600">
                  {r.name}
                </Link>
              </th>
              <td className="py-3 pr-3 text-right text-gray-900">
                {r.avg_amount == null ? <span className="text-gray-400">—</span> : formatManwon(r.avg_amount)}
              </td>
              <td className="py-3 pr-3 text-right text-gray-500">{r.tx_count_12m.toLocaleString("en-US")}건</td>
              <td className="py-3 text-right">
                <Yoy value={r.yoy_change} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
