import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatArea, formatDeal, formatManwon } from "@/lib/format";
import type { RecentTrade } from "@/lib/types";

export default function RecentDeals({ deals }: { deals: RecentTrade[] }) {
  if (deals.length === 0) return <p className="py-6 text-center text-sm text-gray-500">최근 거래가 없습니다</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {deals.map((d, i) => (
        <li key={`${d.apt_id}-${i}`}>
          <Link
            href={`/apartment/${d.apt_id}`}
            className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 transition hover:border-blue-200 hover:shadow-md"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{d.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {d.region_name} · {formatArea(d.area)} · {formatDeal(d.deal_date)}
              </p>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-1">
              <span className="font-bold text-blue-600">{formatManwon(d.amount)}</span>
              <ChevronRight className="h-4 w-4 text-gray-300" aria-hidden />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
