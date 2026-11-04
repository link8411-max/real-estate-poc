import { fetchZones } from "./data";
import type { MapBounds } from "./mapFilters";
import type { Zone } from "./types";

/** 정비구역 안내 문구(지도 카드·목록·섹션 공통). 단정하는 표현을 쓰지 않는다. */
export const ZONE_DISCLAIMER = "국토교통부 전국 도시정비사업 통합 데이터(2026-05 기준). 실제 진행 상황과 다를 수 있습니다.";

export const TYPE_GROUPS = ["재건축", "재개발", "주거환경개선"] as const;

/** 사업 단계, 진행 순서대로. 사업시행자지정(4.5)은 조합설립인가와 같은 위치로 본다(pipeline 과 동일). */
export const STAGES: readonly { name: string; order: number }[] = [
  { name: "정비구역지정", order: 2 },
  { name: "추진위구성", order: 3 },
  { name: "조합설립인가", order: 4 },
  { name: "사업시행자지정", order: 4.5 },
  { name: "사업시행인가", order: 5 },
  { name: "관리처분인가", order: 6 },
  { name: "착공", order: 7 },
];
export const STAGE_NAMES: readonly string[] = STAGES.map((s) => s.name);

export const zoneLabel = (z: Pick<Zone, "type_group" | "stage">): string => `${z.type_group} · ${z.stage}`;

export const formatHouseholds = (n: number | null): string => (n === null ? "-" : `${n.toLocaleString("en-US")}세대`);

/** 서울특별시 → 서울 */
export const SIDO_FILTERS = [
  { label: "서울", sido: "서울특별시" },
  { label: "경기", sido: "경기도" },
  { label: "인천", sido: "인천광역시" },
] as const;

// ---------------------------------------------------------------- 데이터 가져오기

/** 서버(ISR) 용: 파일이 아직 없거나(첫 배포 직후) 깨졌거나 요청이 실패하면 빈 배열 — 페이지는 빈 상태로 그린다 */
export async function fetchZoneItems(init?: RequestInit): Promise<Zone[]> {
  try {
    const file = await fetchZones(init);
    return Array.isArray(file?.zones) ? file.zones : [];
  } catch {
    return [];
  }
}

let zonesPromise: Promise<Zone[]> | null = null;

/** 지도(브라우저) 용: 한 번만 받아 캐시한다. 실패하면 캐시를 비워 다음 호출에서 다시 시도. 파일이 없으면 빈 배열. */
export function loadZonesOnce(): Promise<Zone[]> {
  if (!zonesPromise) {
    zonesPromise = fetchZones().then((f) => (Array.isArray(f?.zones) ? f.zones : []));
    zonesPromise.catch(() => {
      zonesPromise = null;
    });
  }
  return zonesPromise;
}

export const resetZonesCache = () => {
  zonesPromise = null;
};

// ---------------------------------------------------------------- 요약·조회

export interface ZoneSummary {
  total: number;
  byGroup: Record<string, number>;
  byStage: Record<string, number>;
}

export function summarize(zones: readonly Zone[]): ZoneSummary {
  const byGroup: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  for (const z of zones) {
    byGroup[z.type_group] = (byGroup[z.type_group] ?? 0) + 1;
    byStage[z.stage] = (byStage[z.stage] ?? 0) + 1;
  }
  return { total: zones.length, byGroup, byStage };
}

/** 진행 단계 높은 순, 같으면 이름순 */
const byProgress = (a: Zone, b: Zone) => (b.stage_order ?? 0) - (a.stage_order ?? 0) || a.name.localeCompare(b.name, "ko");

export const zonesForRegion = (zones: readonly Zone[], lawdCd: string): Zone[] =>
  zones.filter((z) => z.lawd_cd === lawdCd).sort(byProgress);

export const zonesForApartment = (zones: readonly Zone[], aptId: number): Zone[] =>
  zones.filter((z) => z.apt_ids.includes(aptId));

// ---------------------------------------------------------------- 지도 필터(URL 쿼리)

export interface ZoneFilters {
  on: boolean;
  types: string[];
  stages: string[];
}

export const ZONE_KEYS = ["zones", "zt", "zs"] as const;

const readList = (raw: string | null, allowed: readonly string[]): string[] => {
  const set = new Set((raw ?? "").split(",").map((s) => s.trim()));
  return allowed.filter((a) => set.has(a));
};

export function readZoneFilters(sp: URLSearchParams): ZoneFilters {
  return {
    on: sp.get("zones") === "1",
    types: readList(sp.get("zt"), TYPE_GROUPS),
    stages: readList(sp.get("zs"), STAGE_NAMES),
  };
}

/** 선택 목록에서 값을 넣거나 빼되 항상 정해진 순서로 돌려준다 */
export function toggleIn(list: readonly string[], value: string, order: readonly string[]): string[] {
  const set = new Set(list);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return order.filter((o) => set.has(o));
}

/** 지도에 그릴 구역: 좌표 있음 + (선택한 유형·단계, 비면 전체) + 현재 범위 안 */
export function mapZones(zones: readonly Zone[], f: ZoneFilters, bounds: MapBounds | null | undefined): Zone[] {
  return zones.filter(
    (z) =>
      z.lat !== null &&
      z.lng !== null &&
      (f.types.length === 0 || f.types.includes(z.type_group)) &&
      (f.stages.length === 0 || f.stages.includes(z.stage)) &&
      (!bounds || (z.lat >= bounds.minLat && z.lat <= bounds.maxLat && z.lng >= bounds.minLng && z.lng <= bounds.maxLng)),
  );
}

// ---------------------------------------------------------------- 색

const HUES: Record<string, number> = { 재건축: 262, 재개발: 24, 주거환경개선: 174 };

/** 단계 진행도 0(정비구역지정)~1(착공) */
const progress = (order: number | null): number => Math.min(1, Math.max(0, ((order ?? 2) - 2) / 5));

/**
 * 유형은 색상, 단계는 채도(진행될수록 진하다)로 나타낸다.
 * fill: 마름모 안쪽, border: 테두리·글자 강조용(항상 어두워 흰 배경에서 구분된다).
 */
export function zoneColor(group: string, order: number | null): { fill: string; border: string } {
  const h = HUES[group] ?? 215;
  const t = progress(order);
  return { fill: `hsl(${h} ${Math.round(25 + 60 * t)}% ${Math.round(56 - 14 * t)}%)`, border: `hsl(${h} 65% 28%)` };
}

/** 지도 라벨 겹침 계산용 대략 폭(px): 마름모 18 + 글자(한글 11, 그 밖 6) */
export const zoneLabelWidth = (text: string): number =>
  18 + [...text].reduce((w, c) => w + (/[ᄀ-ᇿ㄰-㆏가-힯]/.test(c) ? 11 : 6), 0);
