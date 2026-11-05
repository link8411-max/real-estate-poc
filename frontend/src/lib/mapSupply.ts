import type { SupplyLabel } from "./types";

/** 지도 단지 항목의 latest_supply_* 를 SupplyLabel 로. 값이 없으면 null (이때 평 대신 ㎡만 쓴다). */
export function mapSupply(a: {
  latest_supply_min?: number | null;
  latest_supply_max?: number | null;
  latest_supply_approx?: boolean | null;
}): SupplyLabel | null {
  if (a.latest_supply_min == null || a.latest_supply_max == null) return null;
  return { min: a.latest_supply_min, max: a.latest_supply_max, approx: a.latest_supply_approx === true };
}
