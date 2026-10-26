import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDeal, formatManwon } from "@/lib/format";
import { browseHref, CITIES } from "@/lib/regions";
import type { RegionFile, RegionStat } from "@/lib/types";

interface Props {
  /** 현행 시군구 전체(stats.regions) */
  regions: RegionStat[];
  city: string;
  /** 선택된 시군구 파일. 없으면 시군구 목록만 */
  region: RegionFile | null;
}

const tab = (active: boolean) =>
  `rounded-full px-4 py-1.5 text-sm font-medium transition ${
    active ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
  }`;

export default function RegionBrowser({ regions, city, region }: Props) {
  const districts = regions.filter((r) => r.city === city).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const regionName = districts.find((d) => d.code === region?.code)?.name ?? region?.name;
  const apartments = region ? [...region.apartments].sort((a, b) => b.trade_count - a.trade_count) : [];

  return (
    <div className="space-y-6">
      <nav className="flex gap-2" aria-label="시도">
        {CITIES.map((c) => (
          <Link key={c} href={browseHref(c)} className={tab(c === city)} aria-current={c === city ? "page" : undefined}>
            {c}
          </Link>
        ))}
      </nav>

      <nav className="flex flex-wrap gap-2" aria-label="시군구">
        {districts.map((d) => (
          <Link
            key={d.code}
            href={browseHref(city, d.code)}
            className={tab(d.code === region?.code)}
            aria-current={d.code === region?.code ? "page" : undefined}
          >
            {d.name}
          </Link>
        ))}
      </nav>

      {region && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-gray-900">
            {city} {regionName} <span className="text-sm font-normal text-gray-500">{apartments.length}개 단지</span>
          </h2>
          {apartments.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">단지가 없습니다</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {apartments.map((a) => (
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
                          {a.latest_trade_date && (
                            <p className="text-xs text-gray-400">{formatDeal(a.latest_trade_date)}</p>
                          )}
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 text-gray-300" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
