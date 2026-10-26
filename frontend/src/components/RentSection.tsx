"use client";

import { useMemo, useState } from "react";
import { LoadMoreButton, useLoadMore } from "@/components/LoadMore";
import PriceChart from "@/components/PriceChart";
import SelectableRow from "@/components/SelectableRow";
import { useAreaUnit } from "@/lib/areaUnit";
import { areaGroup, formatArea, formatDeal, formatExactArea, formatManwon } from "@/lib/format";
import { monthlyHistory } from "@/lib/history";
import type { AptRent, Rent } from "@/lib/types";

type Tab = "jeonse" | "wolse";

/** 전세 "5억 4,000", 월세 "1억 / 150" */
const priceLabel = (deposit: number, monthly: number) =>
  monthly > 0 ? `${formatManwon(deposit)} / ${monthly.toLocaleString("en-US")}` : formatManwon(deposit);

const badge = "rounded-full px-2 py-0.5 text-xs font-medium";

function AreaTable({ rows, avg, tab, selected, onSelect }: {
  rows: Rent[];
  avg: Map<number, number | null>;
  tab: Tab;
  selected: number | null;
  onSelect: (area: number | null) => void;
}) {
  const [unit] = useAreaUnit();
  const groups = useMemo(() => {
    const by = new Map<number, Rent[]>();
    for (const r of rows) by.set(areaGroup(r.area), [...(by.get(areaGroup(r.area)) ?? []), r]);
    return [...by.entries()]
      .sort(([a], [b]) => a - b)
      .map(([area, rs]) => ({ area, count: rs.length, latest: rs.reduce((a, b) => (b.deal_date > a.deal_date ? b : a)) }));
  }, [rows]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="py-2 pr-3 font-medium">평형</th>
            <th className="py-2 pr-3 text-right font-medium">{tab === "jeonse" ? "최근 보증금" : "최근 보증금 / 월세"}</th>
            {tab === "jeonse" && <th className="py-2 pr-3 text-right font-medium">3개월 평균</th>}
            <th className="py-2 text-right font-medium">건수</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ area, count, latest }) => {
            const isSelected = selected === area;
            const toggle = () => onSelect(isSelected ? null : area);
            const a = avg.get(area);
            return (
              <SelectableRow key={area} selected={isSelected} onSelect={toggle}>
                <td className={`py-3 pr-3 font-semibold ${isSelected ? "text-blue-700" : "text-gray-900"}`}>{formatArea(area, unit)}</td>
                <td className="py-3 pr-3 text-right">
                  <span className="font-semibold text-gray-900">{priceLabel(latest.deposit, latest.monthly_rent)}</span>
                  <span className="ml-1 text-xs text-gray-400">{formatDeal(latest.deal_date)}</span>
                </td>
                {tab === "jeonse" && (
                  <td className="py-3 pr-3 text-right text-gray-700">{a != null ? formatManwon(a) : "-"}</td>
                )}
                <td className="py-3 text-right text-gray-500">{count.toLocaleString("en-US")}건</td>
              </SelectableRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RentList({ rows, resetKey }: { rows: Rent[]; resetKey: string }) {
  const [unit] = useAreaUnit();
  const { count, hasMore, showMore, buttonRef } = useLoadMore(rows.length, resetKey);
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-gray-500">거래 내역이 없습니다</p>;

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">{`${rows.length.toLocaleString("en-US")}건`}</p>
      <ul>
        {rows.slice(0, count).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 border-b border-gray-100 py-3 last:border-b-0">
            <div className="flex items-center gap-3 text-sm">
              <span className="w-16 text-gray-500">{formatDeal(r.deal_date)}</span>
              <span className="text-gray-700">{formatExactArea(r.area, unit)}</span>
              {r.floor != null && <span className="text-gray-400">{r.floor}층</span>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {r.contract_type === "갱신" && <span className={`${badge} bg-amber-100 text-amber-700`}>갱신</span>}
              {r.use_rr_right ? <span className={`${badge} bg-green-100 text-green-700`}>갱신요구권</span> : null}
              {r.pre_deposit != null && (
                <span className="text-xs text-gray-400">{`이전 ${priceLabel(r.pre_deposit, r.pre_monthly_rent ?? 0)}`}</span>
              )}
              <span className="font-semibold text-gray-900">{priceLabel(r.deposit, r.monthly_rent)}</span>
            </div>
          </li>
        ))}
      </ul>
      {hasMore && <LoadMoreButton remaining={rows.length - count} onClick={showMore} buttonRef={buttonRef} />}
    </div>
  );
}

/** 단지 상세의 전세·월세 탭 본문: 평형표 → 보증금 추이 → 거래 목록 */
export default function RentSection({ rent, tab }: { rent: AptRent; tab: Tab }) {
  const [unit] = useAreaUnit();
  const [sel, setSel] = useState<{ tab: Tab; area: number | null }>({ tab, area: null });
  const area = sel.tab === tab ? sel.area : null; // 탭이 바뀌면 선택 해제

  const rows = useMemo(
    () => rent.rents.filter((r) => (tab === "jeonse" ? r.monthly_rent === 0 : r.monthly_rent > 0)),
    [rent.rents, tab],
  );
  const avg = useMemo(() => new Map(rent.rent_area_stats.map((s) => [s.area, s.recent_jeonse_avg])), [rent.rent_area_stats]);
  const history = useMemo(() => monthlyHistory(rows, { area, valueKey: "deposit" }), [rows, area]);
  const shown = useMemo(() => (area == null ? rows : rows.filter((r) => areaGroup(r.area) === area)), [rows, area]);
  const scope = area == null ? "전체 평형" : formatArea(area, unit);
  const label = tab === "jeonse" ? "전세" : "월세";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="mb-1 font-bold text-gray-900">평형별 {label} 시세</h2>
        <p className="mb-3 text-xs text-gray-500">행을 누르면 그 평형만 봅니다</p>
        <AreaTable rows={rows} avg={avg} tab={tab} selected={area} onSelect={(a) => setSel({ tab, area: a })} />
      </section>
      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="mb-3 font-bold text-gray-900">
          {label} 보증금 추이 <span className="text-sm font-normal text-gray-500">{scope}</span>
        </h2>
        <PriceChart data={history} valueLabel="평균 보증금" />
      </section>
      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="mb-3 font-bold text-gray-900">
          {label} 거래 내역 <span className="text-sm font-normal text-gray-500">{scope}</span>
        </h2>
        <RentList rows={shown} resetKey={`${tab}:${area}`} />
      </section>
    </div>
  );
}
