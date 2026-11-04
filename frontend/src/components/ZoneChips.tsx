import Link from "next/link";
import { zoneColor, zoneLabel } from "@/lib/redevelopment";
import type { Zone } from "@/lib/types";

/** 유형 색 점 + 글자. 색만으로 구분하지 않도록 글자를 함께 쓴다. */
export function TypeDot({ group, order }: { group: string; order: number | null }) {
  const c = zoneColor(group, order);
  return <span aria-hidden className="inline-block h-2.5 w-2.5 rotate-45 border" style={{ background: c.fill, borderColor: c.border }} />;
}

/** 목록·섹션의 단계 칩: "재건축 · 관리처분인가" */
export function ZoneChip({ zone }: { zone: Zone }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-800">
      <TypeDot group={zone.type_group} order={zone.stage_order} />
      {zoneLabel(zone)}
    </span>
  );
}

/** 단지 페이지 배지. 목록의 해당 구역으로 이동한다. */
export function ZoneBadge({ zone }: { zone: Zone }) {
  return (
    <Link
      href={`/redevelopment#zone-${zone.zone_id}`}
      title={`${zone.name} (${zone.type})`}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 hover:border-blue-300"
    >
      <TypeDot group={zone.type_group} order={zone.stage_order} />
      {zoneLabel(zone)}
    </Link>
  );
}
