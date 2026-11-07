import type { AreaUnit } from "./areaUnit";
import { SUPPLY_ENABLED, supplyText } from "./supply";
import type { SupplyLabel } from "./types";

/** 만원 단위 금액 → "12억 5,000" */
export function formatManwon(n: number): string {
  if (n < 0) return "-" + formatManwon(-n);
  if (n >= 10000) {
    const eok = Math.floor(n / 10000);
    const rest = n % 10000;
    return `${eok}억` + (rest > 0 ? ` ${rest.toLocaleString("en-US")}` : "");
  }
  return n.toLocaleString("en-US");
}

const M2_PER_PYEONG = 3.3058;
export const areaToPyeong = (m2: number): number => Math.round(m2 / M2_PER_PYEONG);

/** "2026-10-06" → "26.10.06" */
export const formatDeal = (d: string): string => d.slice(2).replaceAll("-", ".");

/** 평형 그룹 키: 전용면적 정수부(버림). 파이프라인의 CAST(area AS INTEGER)와 같다. 59.53, 59.4 → 59 */
export const areaGroup = (m2: number): number => Math.floor(m2);

/** 거래의 평형 묶음: 파이프라인이 실어 준 grp(84.97·85.01 → 84), 옛 JSON 이면 버림 면적. */
export const txGroup = (t: { area: number; grp?: number }): number => t.grp ?? areaGroup(t.area);

/**
 * 평형 그룹 기준 표시. 84.88 → 평: "전용 25평 (84㎡)", ㎡: "84㎡ (전용 25평)"
 * 공급평 플래그 on: 평 "33평 · 전용 84㎡", ㎡ "84㎡ (33평)". 공급 정보 없으면 "84㎡"만 (전용평 금지).
 */
export const formatArea = (m2: number, unit: AreaUnit = "pyeong", sp?: SupplyLabel | null): string => {
  const g = areaGroup(m2);
  if (SUPPLY_ENABLED) {
    if (!sp) return `${g}㎡`;
    return unit === "pyeong" ? `${supplyText(sp)} · 전용 ${g}㎡` : `${g}㎡ (${supplyText(sp)})`;
  }
  return unit === "pyeong" ? `전용 ${areaToPyeong(g)}평 (${g}㎡)` : `${g}㎡ (전용 ${areaToPyeong(g)}평)`;
};

/** 개별 거래의 실제 면적. 80.87 → 평: "전용 24.5평", ㎡: "80.87㎡". 플래그 on: "33평 · 전용 80.87㎡" */
export const formatExactArea = (m2: number, unit: AreaUnit = "pyeong", sp?: SupplyLabel | null): string => {
  const exact = `${+m2.toFixed(2)}㎡`;
  if (SUPPLY_ENABLED) {
    if (!sp) return exact;
    return unit === "pyeong" ? `${supplyText(sp)} · 전용 ${exact}` : `${exact} (${supplyText(sp)})`;
  }
  return unit === "pyeong" ? `전용 ${(m2 / M2_PER_PYEONG).toFixed(1)}평` : exact;
};

/** 문장용: 245000 → "24억 5,000만원", 100000 → "10억원" */
export const formatPrice = (n: number): string =>
  `${formatManwon(n)}${n >= 10000 && n % 10000 === 0 ? "원" : "만원"}`;
