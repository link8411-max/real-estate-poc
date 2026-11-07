"use client";

import { useMemo } from "react";
import { LoadMoreButton, useLoadMore } from "@/components/LoadMore";
import ShareButton from "@/components/ShareButton";
import { useAreaUnit } from "@/lib/areaUnit";
import { formatDeal, formatExactArea, formatManwon, txGroup } from "@/lib/format";
import { BADGE_TEXT, buildHighShareTx, highShareMeta, highShareTitle, isShareable, SHARE_HIGHS_ENABLED } from "@/lib/highShare";
import { SITE_URL } from "@/lib/seo";
import { exactLabel } from "@/lib/supply";
import type { AreaType, Transaction } from "@/lib/types";

interface Props {
  transactions: Transaction[];
  /** 평형 묶음(grp). null이면 전체. */
  area: number | null;
  areaTypes?: AreaType[];
  /** 공유 버튼용 단지 id·이름 (없으면 공유 버튼 없음) */
  apt?: { id: number; name: string };
  /** 오늘(KST "YYYY-MM-DD"). 서버에서 내려준다 — 공유 창 30일 판정 */
  today?: string;
}

const BADGE_CLASS = { high: "bg-red-100 text-red-700", up: "bg-orange-100 text-orange-700" } as const;

export default function DealList({ transactions, area, areaTypes, apt, today }: Props) {
  const [unit] = useAreaUnit();
  const filtered = useMemo(
    () => (area == null ? transactions : transactions.filter((t) => txGroup(t) === area)),
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
          const badge = !cancelled ? t.share?.badge : undefined;
          const canShare = SHARE_HIGHS_ENABLED && apt != null && today != null && isShareable(t, today);
          return (
            <li key={t.id} className="flex items-center justify-between border-b border-gray-100 py-3 last:border-b-0">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-16 text-gray-500">{formatDeal(t.deal_date)}</span>
                <span className="text-gray-700">{formatExactArea(t.area, unit, exactLabel(areaTypes, t.area))}</span>
                {t.floor != null && <span className="text-gray-400">{t.floor}층</span>}
              </div>
              <div className="flex items-center gap-2">
                {cancelled && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">취소</span>
                )}
                {badge && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASS[badge]}`}>{BADGE_TEXT[badge]}</span>
                )}
                <span className={`font-semibold ${cancelled ? "text-gray-400 line-through" : "text-gray-900"}`}>
                  {formatManwon(t.amount)}
                </span>
                {t.direct && <span className="text-xs text-gray-400">직거래</span>}
                {canShare && (
                  <ShareButton
                    compact
                    aptId={apt.id}
                    meta={highShareMeta(SITE_URL, apt.id, t.id, highShareTitle(apt.name, buildHighShareTx(t, transactions, areaTypes, today)), t.deal_date).meta}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {hasMore && <LoadMoreButton remaining={filtered.length - count} onClick={showMore} buttonRef={buttonRef} />}
    </div>
  );
}
