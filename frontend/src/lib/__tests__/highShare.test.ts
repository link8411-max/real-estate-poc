import { afterEach, describe, expect, test } from "vitest";
import { highShareTitle, highShareTx, shareAmount } from "@/lib/highShare";
import { setSupplyEnabledForTest } from "@/lib/supply";
import type { AptTrade, Transaction } from "@/lib/types";

afterEach(() => setSupplyEnabledForTest(false));

const TODAY = new Date("2026-11-07T03:00:00Z"); // KST 12시
const apartment = {
  id: 7, name: "래미안", dong: "", lawd_cd: "11680", region_name: "서울 강남구", city: "서울", jibun: "1",
  build_year: 2000, apt_seq: null, lat: null, lng: null, area_types: [{ excl: 84.97, supply: 111.52, approx: false }],
};
const t = (o: Partial<Transaction> & { id: number }): Transaction => ({
  amount: 90000, area: 84.97, floor: 7, deal_date: "2026-03-01", cancel_date: null, grp: 84, ...o,
});
const high = { badge: "high" as const, base: 90000, diff: 10000, pct: 11.1, shareable: true, held: false };
const data = (txs: Transaction[]): AptTrade => ({ apartment, area_stats: [], metrics: {}, transactions: txs });

const sample = data([
  t({ id: 5, amount: 100000, deal_date: "2026-11-01", share: high, direct: true }),
  t({ id: 4, amount: 120000, deal_date: "2026-10-01", cancel_date: "2026-10-10" }),
  t({ id: 3, amount: 60000, area: 59.9, grp: 59, deal_date: "2026-09-01" }),
  t({ id: 2, amount: 90000, area: 85.01, deal_date: "2026-03-01" }),
  t({ id: 1, amount: 80000, deal_date: "2025-06-01" }),
]);

describe("highShareTx", () => {
  test("신고가 거래: 배지·비교값·직거래, series 는 같은 grp·정상·1년", () => {
    const s = highShareTx(sample, 5, TODAY)!;
    expect(s).toMatchObject({ amount: 100000, m2: 84, floor: 7, dealDate: "2026-11-01", direct: true, badge: "high", base: 90000, diff: 10000, canceled: false, shareable: true });
    expect(s.supply).toEqual({ min: 33, max: 33, approx: false });
    expect(s.series).toEqual([{ date: "2026-03-01", amount: 90000 }, { date: "2026-11-01", amount: 100000 }]);
  });

  test("canceled after share: 취소되면 배지·상승액 숨김, 공유 불가", () => {
    const d = data([t({ id: 5, amount: 100000, deal_date: "2026-11-01", cancel_date: "2026-11-05", share: high }), t({ id: 2 })]);
    const s = highShareTx(d, 5, TODAY)!;
    expect(s.canceled).toBe(true);
    expect(s.badge).toBeNull();
    expect(s.base).toBeNull();
    expect(s.diff).toBeNull();
    expect(s.shareable).toBe(false);
  });

  test("30일 지난 거래는 share 가 남아 있어도 공유 불가", () => {
    const d = data([t({ id: 5, amount: 100000, deal_date: "2026-09-28", share: high }), t({ id: 2 })]);
    const s = highShareTx(d, 5, TODAY)!;
    expect(s.badge).toBe("high");
    expect(s.shareable).toBe(false);
  });

  test("share 없으면 배지 없음·공유 불가", () => {
    const s = highShareTx(sample, 2, TODAY)!;
    expect(s.badge).toBeNull();
    expect(s.shareable).toBe(false);
  });

  test("없는 id → null", () => {
    expect(highShareTx(sample, 999, TODAY)).toBeNull();
  });
});

describe("highShareTitle", () => {
  test("신고가·상승·취소 접미사, '축하' 없음", () => {
    const s = highShareTx(sample, 5, TODAY)!;
    expect(highShareTitle("래미안", s)).toBe("래미안 84㎡ 10억 신고가");
    setSupplyEnabledForTest(true);
    expect(highShareTitle("래미안", { ...s, amount: 125000 })).toBe("래미안 33평 12억 5,000만 신고가");
    expect(highShareTitle("래미안", { ...s, badge: "up" })).toBe("래미안 33평 10억 상승");
    expect(highShareTitle("래미안", { ...s, canceled: true, badge: null })).toBe("래미안 33평 10억 신고 후 취소");
    expect(highShareTitle("래미안", { ...s, badge: null })).toBe("래미안 33평 10억");
    expect(highShareTitle("래미안", s)).not.toContain("축하");
  });
});

test("shareAmount", () => {
  expect(shareAmount(10000)).toBe("1억");
  expect(shareAmount(7000)).toBe("7,000만");
  expect(shareAmount(125000)).toBe("12억 5,000만");
});
