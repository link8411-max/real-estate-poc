import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDeal, formatManwon } from "@/lib/format";
import type { RegionApartment } from "@/lib/types";

/** 최근 거래일 최신순(거래일 없는 단지는 맨 뒤) */
const byRecent = (a: RegionApartment, b: RegionApartment): number =>
  (b.latest_trade_date ?? "").localeCompare(a.latest_trade_date ?? "") || b.trade_count - a.trade_count;

/**
 * 단지 목록. 각 항목은 단지 페이지 링크.
 * 시군구 페이지는 거래 많은 순, 동 페이지는 `sort="recent"`(최근 거래일순)에 `showJeonse`로 전세도 보여 준다.
 */
export default function RegionApartmentList({
  apartments,
  sort = "trades",
  showJeonse = false,
}: {
  apartments: RegionApartment[];
  sort?: "trades" | "recent";
  showJeonse?: boolean;
}) {
  const sorted = [...apartments].sort(sort === "recent" ? byRecent : (a, b) => b.trade_count - a.trade_count);
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
                  {showJeonse && a.latest_jeonse_deposit != null && (
                    <p className="text-xs text-gray-500">전세 {formatManwon(a.latest_jeonse_deposit)}</p>
                  )}
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
