import { type Box, cullLabels, labelBox } from "./cullLabels";
import { zoneLabel, zoneLabelWidth } from "./redevelopment";
import type { Zone } from "./types";

/** 이 레벨 이하(확대)에서만 마커에 '유형 · 단계' 글자를 붙인다. 그보다 넓은 화면은 색 마름모만. */
export const ZONE_LABEL_MAX_LEVEL = 5;
export const showZoneLabels = (level: number | undefined): boolean => level === undefined || level <= ZONE_LABEL_MAX_LEVEL;

const DIAMOND_PX = 18;

/** 겹침 계산용 자리표시 문자열(cullLabels 는 7px/자로 폭을 잡는다) */
const placeholder = (z: Zone, labels: boolean) => "x".repeat(Math.ceil((labels ? zoneLabelWidth(zoneLabel(z)) : DIAMOND_PX) / 7));

/**
 * 화면에서 겹치는 구역 마커를 거른다: 선택한 것 > 진행 단계가 높은 것 > 위치가 정확한 것.
 * boxes 는 남은 마커가 차지한 화면 영역 — 아파트 시세 마커가 이 자리를 피하게 넘긴다(구역이 우선).
 */
export function layoutZones(map: kakao.maps.Map, zones: readonly Zone[], selectedId: string | null, labels: boolean): { kept: Zone[]; boxes: Box[] } {
  const projection = map.getProjection();
  const project = (z: Zone) => projection.containerPointFromCoords(new kakao.maps.LatLng(z.lat!, z.lng!));
  const kept = cullLabels(zones, project, {
    label: (z) => placeholder(z, labels),
    weight: (z) => (z.zone_id === selectedId ? Infinity : (z.stage_order ?? 0) * 2 + (z.geo === "dong_approx" ? 0 : 1)),
  });
  return { kept, boxes: kept.map((z) => labelBox(project(z), placeholder(z, labels))) };
}
