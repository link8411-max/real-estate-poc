import Link from "next/link";
import { browseHref, CITIES, regionHref } from "@/lib/regions";
import type { RegionStat } from "@/lib/types";

interface Props {
  /** 현행 시군구 전체(stats.regions) */
  regions: RegionStat[];
  city: string;
}

const tab = (active: boolean) =>
  `rounded-full px-4 py-1.5 text-sm font-medium transition ${
    active ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
  }`;

/** 시도 탭 + 시군구 링크(/region/[code]) */
export default function RegionBrowser({ regions, city }: Props) {
  const districts = regions.filter((r) => r.city === city).sort((a, b) => a.name.localeCompare(b.name, "ko"));

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
          <Link key={d.code} href={regionHref(d.code)} className={tab(false)}>
            {d.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
