import { describe, expect, test } from "vitest";
import { monthlyHistory, slicePeriod } from "../history";

const tx = (amount: number, area: number, deal_date: string, cancel_date: string | null = null) => ({
  id: 0,
  amount,
  area,
  floor: 1,
  deal_date,
  cancel_date,
});

describe("monthlyHistory", () => {
  test("월별 평균·건수, 오름차순", () => {
    const items = [
      tx(100000, 84.9, "2026-01-20"),
      tx(90000, 84.9, "2025-12-03"),
      tx(110000, 84.9, "2026-01-02"),
    ];
    expect(monthlyHistory(items, { valueKey: "amount" })).toEqual([
      { month: "2025-12", avg: 90000, count: 1 },
      { month: "2026-01", avg: 105000, count: 2 },
    ]);
  });

  test("취소 거래 제외", () => {
    const items = [tx(100000, 84.9, "2026-01-20"), tx(1, 84.9, "2026-01-21", "2026-02-01")];
    expect(monthlyHistory(items, { valueKey: "amount" })).toEqual([{ month: "2026-01", avg: 100000, count: 1 }]);
  });

  test("area는 버림 면적으로 거른다: 59.53과 59.4는 같은 59", () => {
    const items = [tx(100000, 84.9, "2026-01-20"), tx(60000, 59.53, "2026-01-20"), tx(62000, 59.4, "2026-01-21"), tx(1, 60.2, "2026-01-21")];
    expect(monthlyHistory(items, { area: 59, valueKey: "amount" })).toEqual([
      { month: "2026-01", avg: 61000, count: 2 },
    ]);
  });

  test("평균은 정수로 반올림", () => {
    const items = [tx(1, 84, "2026-01-01"), tx(2, 84, "2026-01-02")];
    expect(monthlyHistory(items, { valueKey: "amount" })[0].avg).toBe(2);
  });

  test("전세 보증금(deposit) 기준, cancel_date 없는 항목", () => {
    const rents = [
      { deposit: 50000, area: 84, deal_date: "2026-01-05" },
      { deposit: 70000, area: 84, deal_date: "2026-01-15" },
    ];
    expect(monthlyHistory(rents, { valueKey: "deposit" })).toEqual([{ month: "2026-01", avg: 60000, count: 2 }]);
  });

  test("빈 입력 → 빈 배열", () => {
    expect(monthlyHistory([], { valueKey: "amount" })).toEqual([]);
  });
});

describe("slicePeriod", () => {
  const months = ["2020-12", "2021-01", "2023-06", "2024-01", "2025-02", "2026-01"].map((month) => ({ month, avg: 1, count: 1 }));
  const ms = (d: { month: string }[]) => d.map((x) => x.month);

  test("1년: 마지막 달 기준 12개월", () => {
    expect(ms(slicePeriod(months, 1))).toEqual(["2025-02", "2026-01"]);
  });
  test("3년", () => {
    expect(ms(slicePeriod(months, 3))).toEqual(["2023-06", "2024-01", "2025-02", "2026-01"]);
  });
  test("전체(null)는 그대로", () => {
    expect(slicePeriod(months, null)).toBe(months);
  });
  test("빈 배열", () => {
    expect(slicePeriod([], 1)).toEqual([]);
  });
});
