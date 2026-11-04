import { describe, expect, test } from "vitest";
import { recentHighsFor, topByPct } from "@/lib/highs";
import type { RecordHigh } from "@/lib/types";

const mk = (o: Partial<RecordHigh>): RecordHigh => ({
  tx_id: 1, apt_id: 10, apt_name: "단지", region_name: "서울 강남구", city: "서울", lawd_cd: "11680", dong: "역삼동",
  area: 84.9, area_group: 84, floor: 5, amount: 120000, prev_max: 100000, jump: 20000, jump_pct: 20, deal_date: "2026-10-20", ...o,
});

describe("recentHighsFor", () => {
  const items = [
    mk({ tx_id: 1, deal_date: "2026-10-01" }),
    mk({ tx_id: 2, deal_date: "2026-10-05", dong: "개포동" }),
    mk({ tx_id: 3, deal_date: "2026-10-09", lawd_cd: "41135" }),
    ...[4, 5, 6, 7, 8].map((n) => mk({ tx_id: n, deal_date: `2026-10-1${n}` })),
  ];
  test("지역 코드로 거르고 최신순 최대 5개", () => {
    expect(recentHighsFor(items, "11680").map((i) => i.tx_id)).toEqual([8, 7, 6, 5, 4]);
  });
  test("동까지 주면 그 동만", () => {
    expect(recentHighsFor(items, "11680", "개포동").map((i) => i.tx_id)).toEqual([2]);
  });
  test("같은 날은 상승률 큰 순, 빈 입력 안전", () => {
    const r = recentHighsFor([mk({ tx_id: 1, jump_pct: 3 }), mk({ tx_id: 2, jump_pct: 9 })], "11680");
    expect(r.map((i) => i.tx_id)).toEqual([2, 1]);
    expect(recentHighsFor([], "11680")).toEqual([]);
  });
});

test("topByPct: 상승률 내림차순 n건, 원본 불변", () => {
  const a = [mk({ tx_id: 1, jump_pct: 1 }), mk({ tx_id: 2, jump_pct: 30 }), mk({ tx_id: 3, jump_pct: 5 }), mk({ tx_id: 4, jump_pct: 9 })];
  expect(topByPct(a, 3).map((i) => i.tx_id)).toEqual([2, 4, 3]);
  expect(a[0].tx_id).toBe(1);
});
