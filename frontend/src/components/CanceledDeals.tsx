"use client";

import { useAreaUnit } from "@/lib/areaUnit";
import type { CanceledTx } from "@/lib/canceled";
import { formatArea, formatPrice } from "@/lib/format";

export default function CanceledDeals({ items }: { items: CanceledTx[] }) {
  const [unit] = useAreaUnit();
  if (items.length === 0) return null;
  return (
    <section id="canceled" className="rounded-2xl border border-gray-100 bg-white p-5">
      <h2 className="mb-3 font-bold text-gray-900">취소된 거래 {items.length}건</h2>
      <ul className="divide-y divide-gray-100 text-sm">
        {items.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-gray-700">
            <span className="text-gray-500">{t.deal_date}</span>
            <span>{formatArea(t.area, unit)}</span>
            {t.floor != null && <span>{t.floor}층</span>}
            <span className="font-semibold text-gray-900">{formatPrice(t.amount)}</span>
            <span className="text-gray-500">{t.cancel_date} 취소</span>
            {t.is_high && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">당시 신고가</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-500">거래 해제는 대출 불발·계약 합의 해지 등 여러 이유로 생깁니다. 국토교통부 실거래가 공개 자료 기준.</p>
    </section>
  );
}
