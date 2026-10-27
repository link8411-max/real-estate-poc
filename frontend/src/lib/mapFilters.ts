import type { AreaUnit } from "./areaUnit";

export type MapMode = "trade" | "rent";

/** 지도 페이지가 URL 쿼리로 들고 다니는 필터. 금액은 만원, 면적은 ㎡(평형 그룹). */
export interface MapFilters {
  mode: MapMode;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  builtFrom?: number;
}

export const FILTER_KEYS = ["minPrice", "maxPrice", "minArea", "maxArea", "builtFrom"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

/** 가격대 선택지(억). 값은 만원으로 보낸다. */
export const PRICE_STEPS_EOK = [3, 5, 7, 10, 15, 20, 30] as const;

export interface AreaPreset {
  minArea?: number;
  maxArea?: number;
  pyeong: string;
}

/** 평형 구간. 경계는 ㎡ 평형 그룹(정수, API의 gte/lte 기준)이라 서로 겹치지 않는다. 라벨은 단위별로 만든다. */
export const AREA_PRESETS: readonly AreaPreset[] = [
  { maxArea: 65, pyeong: "~20평" },
  { minArea: 66, maxArea: 98, pyeong: "20평대" },
  { minArea: 99, maxArea: 131, pyeong: "30평대" },
  { minArea: 132, pyeong: "40평+" },
];

export function areaPresetLabel(p: AreaPreset, unit: AreaUnit): string {
  if (unit === "pyeong") return p.pyeong;
  if (p.minArea === undefined) return `~${p.maxArea}㎡`;
  if (p.maxArea === undefined) return `${p.minArea}㎡+`;
  return `${p.minArea}~${p.maxArea}㎡`;
}

/** 준공 N년 이내 선택지 */
export const BUILT_PRESETS = [5, 10, 20] as const;
export const builtFromYears = (years: number, now: Date = new Date()): number => now.getFullYear() - years;

export function readMapFilters(sp: URLSearchParams): MapFilters {
  const f: MapFilters = { mode: sp.get("mode") === "rent" ? "rent" : "trade" };
  for (const k of FILTER_KEYS) {
    const raw = sp.get(k);
    if (raw === null || raw.trim() === "") continue;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) f[k] = n;
  }
  return f;
}

/** /api/v1/map에 보낼 필터 파라미터(mode 제외) */
export function toApiQuery(f: MapFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of FILTER_KEYS) if (f[k] !== undefined) out[k] = String(f[k]);
  return out;
}

/** 모바일 시트 바에 보여줄 활성 필터 수: 가격대·평형·준공 각각 1 */
export function countActiveFilters(f: MapFilters): number {
  const has = (...ks: FilterKey[]) => ks.some((k) => f[k] !== undefined);
  return [has("minPrice", "maxPrice"), has("minArea", "maxArea"), has("builtFrom")].filter(Boolean).length;
}

/** 지도 라벨용 금액: 123000 → "12.3억", 9500 → "9,500" */
export function formatMapLabel(manwon: number): string {
  if (manwon < 10000) return manwon.toLocaleString("en-US");
  return `${+(manwon / 10000).toFixed(1)}억`;
}

export interface MapBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** API 제한과 같다: 레벨 7 이하(단지 모드)는 1.5도 넘는 범위를 받지 않는다. */
export const MAX_SPAN_DEG = 1.5;
export const APARTMENT_MAX_LEVEL = 7;

export const exceedsMapSpan = (b: MapBounds, level: number): boolean =>
  level <= APARTMENT_MAX_LEVEL && (b.maxLat - b.minLat > MAX_SPAN_DEG || b.maxLng - b.minLng > MAX_SPAN_DEG);

export const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청
export const DEFAULT_LEVEL = 8;

/** 공유 링크의 ?lat&lng&level. 한반도 밖이거나 잘못된 값은 기본값(서울시청, 레벨 8). */
export function readInitialView(sp: URLSearchParams): { center: { lat: number; lng: number }; level: number } {
  const n = (k: string, lo: number, hi: number) => {
    const raw = sp.get(k);
    const v = raw === null || raw.trim() === "" ? NaN : Number(raw);
    return Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
  };
  const lat = n("lat", 33, 39);
  const lng = n("lng", 124, 132);
  const level = n("level", 1, 14);
  return {
    center: lat !== undefined && lng !== undefined ? { lat, lng } : DEFAULT_CENTER,
    level: level !== undefined && Number.isInteger(level) ? level : DEFAULT_LEVEL,
  };
}

/** 크기가 사실상 0인 범위(지도 컨테이너가 0px일 때 생긴다). 이런 범위로는 요청하지 않는다. */
export const isDegenerateBounds = (b: MapBounds): boolean => b.maxLat - b.minLat < 1e-6 || b.maxLng - b.minLng < 1e-6;
