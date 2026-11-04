import Link from "next/link";
import { ZoneChip } from "@/components/ZoneChips";
import { formatHouseholds, summarize, TYPE_GROUPS, ZONE_DISCLAIMER } from "@/lib/redevelopment";
import type { Zone } from "@/lib/types";

const MAX_ROWS = 8;

/** 지역 페이지의 정비사업 섹션. 해당 지역 구역이 없으면(데이터 파일이 없을 때 포함) 아무것도 그리지 않는다. zones 는 진행 단계 높은 순. */
export default function RegionRedevelopment({ zones }: { zones: Zone[] }) {
  if (zones.length === 0) return null;
  const s = summarize(zones);
  const counts = TYPE_GROUPS.filter((g) => s.byGroup[g]).map((g) => `${g} ${s.byGroup[g]}곳`);
  return (
    <section aria-label="정비사업">
      <h2 className="mb-1 text-lg font-bold text-gray-900">정비사업 <span className="text-sm font-normal text-gray-500">{counts.join(" · ")}</span></h2>
      <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white">
        {zones.slice(0, MAX_ROWS).map((z) => (
          <li key={z.zone_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <Link href={`/redevelopment#zone-${z.zone_id}`} className="min-w-0 truncate text-sm font-medium text-gray-900 hover:text-blue-600">
              {z.name}
            </Link>
            <ZoneChip zone={z} />
            <span className="ml-auto text-xs text-gray-500">{formatHouseholds(z.households)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-gray-500">
        {zones.length > MAX_ROWS && <>외 {zones.length - MAX_ROWS}곳 · </>}
        <Link href="/redevelopment" className="text-blue-600 hover:underline">전체 목록 ›</Link>
      </p>
      <p className="mt-1 text-xs text-gray-400">{ZONE_DISCLAIMER}</p>
    </section>
  );
}
