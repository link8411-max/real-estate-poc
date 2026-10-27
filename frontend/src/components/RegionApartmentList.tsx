import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDeal, formatManwon } from "@/lib/format";
import type { RegionApartment } from "@/lib/types";

/** 시군구 단지 목록(거래 많은 순). 각 항목은 단지 페이지 링크. */
export default function RegionApartmentList({ apartments }: { apartments: RegionApartment[] }) {
  const sorted = [...apartments].sort((a, b) => b.trade_count - a.trade_count);
  if (sorted.length === 0) return <p className="py-8 text-center text-sm text-gray-500">단지가 없습니다</p>;

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {sorted.map((a) => (
        <li key={a.id}>
          <Link
            href={`/apartment/${a.id}`}
            className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 transition hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Building2 className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{a.name}</p>
                <p className="text-xs text-gray-500">
                  {a.dong}
                  {a.build_year ? ` · ${a.build_year}년` : ""} · 거래 {a.trade_count.toLocaleString("en-US")}건
                </p>
              </div>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-1 text-right">
              {a.latest_trade_amount != null && (
                <div>
                  <p className="font-bold text-gray-900">{formatManwon(a.latest_trade_amount)}</p>
                  {a.latest_trade_date && <p className="text-xs text-gray-400">{formatDeal(a.latest_trade_date)}</p>}
                </div>
              )}
              <ChevronRight className="h-4 w-4 text-gray-300" aria-hidden />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
