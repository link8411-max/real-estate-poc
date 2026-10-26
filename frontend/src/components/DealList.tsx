"use client";

import { useMemo } from "react";
import { LoadMoreButton, useLoadMore } from "@/components/LoadMore";
import { areaGroup, formatDeal, formatManwon } from "@/lib/format";
import type { Transaction } from "@/lib/types";

interface Props {
  transactions: Transaction[];
  /** 평형 그룹(버림 면적). null이면 전체. */
  area: number | null;
}

export default function DealList({ transactions, area }: Props) {
  const filtered = useMemo(
    () => (area == null ? transactions : transactions.filter((t) => areaGroup(t.area) === area)),
    [transactions, area],
  );

  const { count, hasMore, showMore, buttonRef } = useLoadMore(filtered.length, area);
  const cancelledCount = filtered.filter((t) => t.cancel_date != null).length;

  if (filtered.length === 0) return <p className="py-8 text-center text-sm text-gray-500">거래 내역이 없습니다</p>;

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">
        {`${filtered.length.toLocaleString("en-US")}건`}
        {cancelledCount > 0 && ` (취소 ${cancelledCount.toLocaleString("en-US")}건 포함)`}
      </p>
      <ul>
        {filtered.slice(0, count).map((t) => {
          const cancelled = t.cancel_date != null;
          return (
            <li key={t.id} className="flex items-center justify-between border-b border-gray-100 py-3 last:border-b-0">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-16 text-gray-500">{formatDeal(t.deal_date)}</span>
                <span className="text-gray-700">{+t.area.toFixed(2)}㎡</span>
                {t.floor != null && <span className="text-gray-400">{t.floor}층</span>}
              </div>
              <div className="flex items-center gap-2">
                {cancelled && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">취소</span>
                )}
                <span className={`font-semibold ${cancelled ? "text-gray-400 line-through" : "text-gray-900"}`}>
                  {formatManwon(t.amount)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {hasMore && <LoadMoreButton remaining={filtered.length - count} onClick={showMore} buttonRef={buttonRef} />}
    </div>
  );
}
