import { areaClassMap } from "./areaClass";
import type { AreaType, SupplyLabel } from "./types";

/** 공급평 표기 플래그. 꺼져 있으면 화면 문자열은 기존과 같다. */
export let SUPPLY_ENABLED: boolean = process.env.NEXT_PUBLIC_SUPPLY_PYEONG === "1";

/** 테스트에서 플래그를 바꾼다. */
export function setSupplyEnabledForTest(v: boolean): void {
  SUPPLY_ENABLED = v;
}

const M2_PER_PYEONG = 3.3058;

/** 공급㎡ → 평 (버림, 단 소수 .95 이상은 올림 — 대장·분양 면적 오차). 111.52 → 33, 82.55 → 25. 파이프라인 supply_pyeong과 같다. */
const PYEONG_ROUND_UP = 0.05;
export const supplyPyeong = (m2: number): number => Math.floor(m2 / M2_PER_PYEONG + PYEONG_ROUND_UP);

/** 전용면적(±0.05㎡)이 같은 주택형. 파이프라인 lookup의 정확 일치 규칙과 같다. */
export function findType(types: AreaType[], m2: number): AreaType | null {
  return types.find((t) => Math.abs(t.excl - m2) <= 0.05 + 1e-9) ?? null;
}

const toLabel = (ts: AreaType[]): SupplyLabel | null => {
  if (ts.length === 0) return null;
  const py = ts.map((t) => supplyPyeong(t.supply));
  return { min: Math.min(...py), max: Math.max(...py), approx: ts.some((t) => t.approx) };
};

/** 주택형 목록을 평형 묶음 규칙(areaClass)으로 묶은 것: 같은 묶음 라벨 → 주택형들 */
const typeClasses = (types: AreaType[], extra?: number): Map<number, AreaType[]> => {
  const cls = areaClassMap([...types.map((t) => [t.excl, 1] as [number, number]), ...(extra != null ? [[extra, 0] as [number, number]] : [])]);
  const out = new Map<number, AreaType[]>();
  for (const t of types) {
    const k = cls.get(t.excl)!;
    out.set(k, [...(out.get(k) ?? []), t]);
  }
  return out;
};

/**
 * 평형 묶음 group(거래 grp 라벨, 84.97·85.01 → 84)에 속한 주택형들의 공급평 범위. 없으면 null.
 * 버림 면적이 group 인 주택형이 들어 있는 묶음을 통째로 쓴다(85.01 주택형도 84 묶음에 들어간다).
 */
export function groupLabel(types: AreaType[] | undefined, group: number): SupplyLabel | null {
  if (!types) return null;
  const hit: AreaType[] = [];
  for (const ts of typeClasses(types).values()) if (ts.some((t) => Math.floor(t.excl) === group)) hit.push(...ts);
  return toLabel(hit);
}

/** 개별 면적의 공급평. 같은 주택형이 없으면 그 면적과 같은 묶음 주택형들의 범위. */
export function exactLabel(types: AreaType[] | undefined, m2: number): SupplyLabel | null {
  if (!types) return null;
  const t = findType(types, m2);
  if (t) return toLabel([t]);
  const cls = areaClassMap([...types.map((x) => [x.excl, 1] as [number, number]), [m2, 0]]);
  const g = cls.get(m2);
  return toLabel(types.filter((x) => cls.get(x.excl) === g));
}

/** "33평" / "약 34평" / "33~34평" / "약 33~34평" */
export function supplyText(sp: SupplyLabel): string {
  const body = sp.min === sp.max ? `${sp.min}평` : `${sp.min}~${sp.max}평`;
  return sp.approx ? `약 ${body}` : body;
}
