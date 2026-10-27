import { describe, expect, test } from "vitest";
import { daysSince, kstToday, liveMetrics, recentWindow } from "@/lib/metrics";
import type { AptRent, AptTrade, Rent, Transaction } from "@/lib/types";

const TODAY = "2026-10-27";

let seq = 0;
const tx = (deal_date: string, amount: number, o: Partial<Transaction> = {}): Transaction => ({
  id: ++seq,
  amount,
  area: 84.97,
  floor: 5,
  deal_date,
  cancel_date: null,
  ...o,
});

const rent = (deal_date: string, deposit: number, o: Partial<Rent> = {}): Rent => ({
  id: ++seq,
  deposit,
  monthly_rent: 0,
  area: 84.5,
  floor: 3,
  deal_date,
  contract_type: null,
  use_rr_right: null,
  pre_deposit: null,
  pre_monthly_rent: null,
  ...o,
});

const apartment = { id: 1 } as AptTrade["apartment"];
const trade = (transactions: Transaction[]): AptTrade => ({ apartment, area_stats: [], metrics: {}, transactions });
const rents = (rs: Rent[]): AptRent => ({ apartment, rent_area_stats: [], rents: rs });

describe("kstToday", () => {
  test("UTC 15:00 이후는 KST 다음 날", () => {
    expect(kstToday(new Date("2026-10-31T14:59:00Z"))).toBe("2026-10-31");
    expect(kstToday(new Date("2026-10-31T15:00:00Z"))).toBe("2026-11-01");
  });
});

describe("daysSince", () => {
  test("날짜 차이(일)", () => {
    expect(daysSince("2026-10-27", TODAY)).toBe(0);
    expect(daysSince("2026-07-29", TODAY)).toBe(90);
    expect(daysSince("2025-10-27", TODAY)).toBe(365);
  });
});

describe("recentWindow", () => {
  test("정확히 90일 전은 포함, 91일 전은 제외", () => {
    const items = [tx("2026-07-29", 100), tx("2026-07-28", 999)];
    expect(recentWindow(items, { valueKey: "amount", days: 90, today: TODAY })).toEqual({ avg: 100, count: 1 });
  });

  test("취소 거래는 제외", () => {
    const items = [tx("2026-10-01", 100), tx("2026-10-02", 300, { cancel_date: "2026-10-10" })];
    expect(recentWindow(items, { valueKey: "amount", days: 90, today: TODAY })).toEqual({ avg: 100, count: 1 });
  });

  test("평형 그룹(정수부) 필터, 없으면 avg null", () => {
    const items = [tx("2026-10-01", 100, { area: 59.9 }), tx("2026-10-01", 200, { area: 84.1 })];
    expect(recentWindow(items, { area: 59, valueKey: "amount", days: 90, today: TODAY })).toEqual({ avg: 100, count: 1 });
    expect(recentWindow(items, { area: 74, valueKey: "amount", days: 90, today: TODAY })).toEqual({ avg: null, count: 0 });
  });

  test("평균은 반올림", () => {
    const items = [tx("2026-10-01", 100), tx("2026-10-02", 101)];
    expect(recentWindow(items, { valueKey: "amount", days: 90, today: TODAY }).avg).toBe(101);
  });
});

describe("liveMetrics", () => {
  test("최근 3건 이상이면 급매 지표, 회복률·전고점·경과일·전세가율", () => {
    const t = trade([
      tx("2026-10-20", 90000),
      tx("2026-09-10", 100000),
      tx("2026-08-10", 110000),
      tx("2021-09-25", 120000),
      tx("2026-10-25", 50000, { area: 59.5, cancel_date: "2026-10-26" }), // 취소 → 최신 아님
    ]);
    const r = rents([rent("2026-10-01", 60000), rent("2026-09-01", 58000), rent("2026-10-02", 20000, { monthly_rent: 100 })]);
    expect(liveMetrics(t, r, TODAY)).toEqual({
      bargain_amount: -10000,
      bargain_percent: -10,
      recovery_rate: 75,
      peak_date: "2021-09-25",
      days_since_last_tx: 7,
      jeonse_ratio: 59, // 59000 / 100000
    });
  });

  test("최근 거래가 3건 미만이면 급매 지표 없음", () => {
    const t = trade([tx("2026-10-20", 90000), tx("2026-09-10", 100000), tx("2026-01-10", 110000)]);
    const m = liveMetrics(t, null, TODAY);
    expect(m.bargain_amount).toBeUndefined();
    expect(m.bargain_percent).toBeUndefined();
    expect(m.days_since_last_tx).toBe(7);
    expect(m.jeonse_ratio).toBeUndefined();
  });

  test("시간이 지나면 최근 평균에서 빠진다(내보낸 날 고정 아님)", () => {
    const t = trade([tx("2026-07-01", 90000), tx("2026-06-20", 100000), tx("2026-06-10", 110000)]);
    expect(liveMetrics(t, null, "2026-08-01").bargain_percent).toBe(-10);
    const later = liveMetrics(t, null, TODAY);
    expect(later.bargain_percent).toBeUndefined();
    expect(later.days_since_last_tx).toBe(118);
  });

  test("최신 거래 평형 그룹 기준(다른 평형 거래는 안 섞는다)", () => {
    const t = trade([
      tx("2026-10-20", 60000, { area: 59.1 }),
      tx("2026-10-10", 200000),
      tx("2026-10-05", 200000),
      tx("2026-10-01", 200000),
    ]);
    const m = liveMetrics(t, rents([rent("2026-10-01", 30000, { area: 59.8 })]), TODAY);
    expect(m.bargain_percent).toBeUndefined(); // 59㎡ 최근 1건
    expect(m.recovery_rate).toBe(100);
    expect(m.jeonse_ratio).toBe(50);
  });

  test("전세가율은 최근 3개월 전세·매매 둘 다 있어야", () => {
    const t = trade([tx("2026-10-20", 100000)]);
    expect(liveMetrics(t, rents([rent("2026-06-01", 60000)]), TODAY).jeonse_ratio).toBeUndefined();
    const old = trade([tx("2026-01-20", 100000)]);
    expect(liveMetrics(old, rents([rent("2026-10-01", 60000)]), TODAY).jeonse_ratio).toBeUndefined();
  });

  test("매매가 없으면(전월세만) 빈 객체", () => {
    expect(liveMetrics(trade([]), rents([rent("2026-10-01", 60000)]), TODAY)).toEqual({});
    expect(liveMetrics(trade([tx("2026-10-01", 1, { cancel_date: "2026-10-02" })]), null, TODAY)).toEqual({});
  });
});
