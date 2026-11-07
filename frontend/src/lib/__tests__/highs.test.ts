import { describe, expect, test } from "vitest";
import { highsIntro, recentHighsFor, topByPct } from "@/lib/highs";
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

describe("highsIntro", () => {
  test("건수·도시별 건수(0건 도시 제외)·가장 큰 상승", () => {
    const list = [
      mk({ tx_id: 1, city: "서울", apt_name: "A", jump_pct: 5 }),
      mk({ tx_id: 2, city: "서울", apt_name: "B", jump_pct: 12.5 }),
      mk({ tx_id: 3, city: "경기", apt_name: "C", jump_pct: 23 }),
    ];
    expect(highsIntro(list)).toBe(
      "최근 30일 수도권 아파트 신고가는 3건으로 서울 2건, 경기 1건입니다. 신고가는 같은 단지·같은 평형의 이전 최고가를 넘은 계약이며, 가장 큰 상승은 C +23%입니다.",
    );
  });
  test("천 단위 쉼표", () => {
    const list = Array.from({ length: 1593 }, (_, i) => mk({ tx_id: i, city: "경기" }));
    expect(highsIntro(list)).toContain("신고가는 1,593건으로 경기 1,593건입니다.");
  });
  test("0건", () => {
    expect(highsIntro([])).toBe("최근 30일 수도권 아파트 신고가가 없습니다.");
  });
});
