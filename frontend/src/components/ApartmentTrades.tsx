"use client";

import { useMemo, useState } from "react";
import AreaStatsTable from "@/components/AreaStatsTable";
import DealList from "@/components/DealList";
import PriceChart from "@/components/PriceChart";
import { formatArea } from "@/lib/format";
import { monthlyHistory } from "@/lib/history";
import type { AreaStat, Transaction } from "@/lib/types";

/** 상세 페이지의 평형 선택 → 차트·거래목록 연동 */
export default function ApartmentTrades({ stats, transactions }: { stats: AreaStat[]; transactions: Transaction[] }) {
  const [area, setArea] = useState<number | null>(null);
  const history = useMemo(() => monthlyHistory(transactions, { area, valueKey: "amount" }), [transactions, area]);
  const scope = area == null ? "전체 평형" : formatArea(area);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="mb-1 font-bold text-gray-900">평형별 시세</h2>
        <p className="mb-3 text-xs text-gray-500">행을 누르면 그 평형만 봅니다</p>
        <AreaStatsTable stats={stats} selected={area} onSelect={setArea} />
      </section>
      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="mb-3 font-bold text-gray-900">
          시세 추이 <span className="text-sm font-normal text-gray-500">{scope}</span>
        </h2>
        <PriceChart data={history} />
      </section>
      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="mb-3 font-bold text-gray-900">
          실거래 내역 <span className="text-sm font-normal text-gray-500">{scope}</span>
        </h2>
        <DealList transactions={transactions} area={area} />
      </section>
    </div>
  );
}
