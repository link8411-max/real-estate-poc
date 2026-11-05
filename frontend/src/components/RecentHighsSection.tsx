import Link from "next/link";
import HighArea from "@/components/HighArea";
import { formatDeal, formatPrice } from "@/lib/format";
import type { RecordHigh } from "@/lib/types";

/** 지역·동 페이지의 "최근 신고가" 섹션. 항목이 없으면 아무것도 그리지 않는다. */
export default function RecentHighsSection({ items }: { items: RecordHigh[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">
          최근 신고가 <span className="text-sm font-normal text-gray-500">최근 30일</span>
        </h2>
        <Link href="/highs" className="text-sm text-blue-600 hover:underline">
          전체 보기 ›
        </Link>
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.tx_id}>
            <Link
              href={`/apartment/${i.apt_id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3 transition hover:border-rose-200 hover:shadow-md"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{i.apt_name}</p>
                <p className="text-xs text-gray-500">
                  <HighArea area={i.area} sp={i.supply} /> · {formatDeal(i.deal_date)}
                </p>
              </div>
              <p className="shrink-0 text-right">
                <span className="font-bold text-rose-600">{formatPrice(i.amount)}</span>
                <span className="ml-2 text-sm font-semibold text-rose-500">+{i.jump_pct}%</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
