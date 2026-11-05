import type { AreaType, SupplyLabel } from "./types";

/** 공급평 표기 플래그. 꺼져 있으면 화면 문자열은 기존과 같다. */
export let SUPPLY_ENABLED: boolean = process.env.NEXT_PUBLIC_SUPPLY_PYEONG === "1";

/** 테스트에서 플래그를 바꾼다. */
export function setSupplyEnabledForTest(v: boolean): void {
  SUPPLY_ENABLED = v;
}

const M2_PER_PYEONG = 3.3058;

/** 공급㎡ → 평 (버림). 111.52 → 33 */
export const supplyPyeong = (m2: number): number => Math.floor(m2 / M2_PER_PYEONG);

/** 전용면적(±0.05㎡)이 같은 주택형. 파이프라인 lookup의 정확 일치 규칙과 같다. */
export function findType(types: AreaType[], m2: number): AreaType | null {
  return types.find((t) => Math.abs(t.excl - m2) <= 0.05 + 1e-9) ?? null;
}

const toLabel = (ts: AreaType[]): SupplyLabel | null => {
  if (ts.length === 0) return null;
  const py = ts.map((t) => supplyPyeong(t.supply));
  return { min: Math.min(...py), max: Math.max(...py), approx: ts.some((t) => t.approx) };
};

/** 전용 정수 묶음에 속한 주택형들의 공급평 범위. 없으면 null. */
export function groupLabel(types: AreaType[] | undefined, group: number): SupplyLabel | null {
  if (!types) return null;
  return toLabel(types.filter((t) => Math.floor(t.excl) === group));
}

/** 개별 면적의 공급평. 같은 주택형이 없으면 같은 정수 묶음의 범위. */
export function exactLabel(types: AreaType[] | undefined, m2: number): SupplyLabel | null {
  if (!types) return null;
  const t = findType(types, m2);
  return t ? toLabel([t]) : groupLabel(types, Math.floor(m2));
}

/** "33평" / "약 34평" / "33~34평" / "약 33~34평" */
export function supplyText(sp: SupplyLabel): string {
  const body = sp.min === sp.max ? `${sp.min}평` : `${sp.min}~${sp.max}평`;
  return sp.approx ? `약 ${body}` : body;
}
