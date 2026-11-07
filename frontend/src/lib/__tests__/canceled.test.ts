import { describe, expect, test } from "vitest";
import { analyzeCanceled, canceledIntro, countSince, pickHeadline, toIsoDate, topJumps } from "@/lib/canceled";
import type { CanceledHigh, Transaction } from "@/lib/types";

let seq = 0;
const tx = (deal_date: string, amount: number, cancel_date: string | null, area = 84.97): Transaction => ({
  id: ++seq,
  amount,
  area,
  floor: 5,
  deal_date,
  cancel_date,
});

const scenario = (fmt: (iso: string) => string): Transaction[] => [
  tx("2026-01-10", 100000, null),
  tx("2026-02-10", 120000, fmt("2026-03-01")),
  tx("2026-03-10", 110000, null),
  tx("2026-04-10", 110000, fmt("2026-05-01")),
  tx("2026-02-20", 90000, fmt("2026-03-05"), 59.9),
];
const legacy = (iso: string) => iso.slice(2).replaceAll("-", ".");

const item = (cancel_date: string, jump: number): CanceledHigh => ({
  tx_id: ++seq,
  apt_id: 1,
  apt_name: "a",
  region_name: "r",
  city: "서울",
  area: 84.97,
  area_group: 84,
  floor: 5,
  amount: 100000,
  prev_max: 100000 - jump,
  jump,
  deal_date: "2026-01-01",
  cancel_date,
  days_to_cancel: 1,
});

describe("toIsoDate", () => {
  test("legacy and ISO", () => {
    expect(toIsoDate("25.07.28")).toBe("2025-07-28");
    expect(toIsoDate("2025-07-28")).toBe("2025-07-28");
  });
});

describe("analyzeCanceled", () => {
  for (const [name, fmt] of [["iso", (s: string) => s], ["legacy", legacy]] as const) {
    test(`record high only for 12억 (${name})`, () => {
      const { canceled, aboveMaxByArea } = analyzeCanceled(scenario(fmt));
      expect(canceled).toHaveLength(3);
      const highs = canceled.filter((c) => c.is_high);
      expect(highs).toHaveLength(1);
      expect(highs[0].amount).toBe(120000);
      expect(highs[0].prev_max).toBe(100000);
      expect(canceled.find((c) => c.amount === 110000)!.is_high).toBe(false);
      // 이른 시점에 취소된 12억은 prev_max 에 들어가지 않는다(정상 거래 최고가 11억)
      expect(canceled.find((c) => c.amount === 110000)!.prev_max).toBe(110000);
      const other = canceled.find((c) => c.amount === 90000)!;
      expect(other.is_high).toBe(false);
      expect(other.prev_max).toBeNull();
      expect(aboveMaxByArea.get(84)).toBe(120000);
      expect(aboveMaxByArea.has(59)).toBe(false);
      expect(canceled.map((c) => c.cancel_iso)).toEqual(["2026-05-01", "2026-03-05", "2026-03-01"]);
    });
  }

  test("equal to earlier max is not a high", () => {
    const { canceled } = analyzeCanceled([tx("2026-01-01", 100000, null), tx("2026-02-01", 100000, "2026-02-05")]);
    expect(canceled[0].is_high).toBe(false);
  });
});

describe("analyzeCanceled 경계", () => {
  test("같은 날 정상 거래는 이전으로 치지 않는다", () => {
    const { canceled } = analyzeCanceled([tx("2026-05-01", 130000, null), tx("2026-05-01", 125000, "2026-05-09")]);
    expect(canceled[0].prev_max).toBeNull();
    expect(canceled[0].is_high).toBe(false);
  });
  test("취소 금액이 정상 최고가 이하이면 aboveMaxByArea 에 키 없음", () => {
    const { aboveMaxByArea } = analyzeCanceled([
      tx("2026-01-01", 120000, null),
      tx("2026-02-01", 120000, "2026-02-05"),
      tx("2026-03-01", 100000, "2026-03-05"),
    ]);
    expect(aboveMaxByArea.has(84)).toBe(false);
  });
});

describe("countSince", () => {
  test("counts by cancel_iso", () => {
    const { canceled } = analyzeCanceled(scenario((s) => s));
    expect(countSince(canceled, "2026-04-01")).toEqual({ total: 1, highs: 0 });
    expect(countSince(canceled, "2026-03-02")).toEqual({ total: 2, highs: 0 });
    expect(countSince(canceled, "2026-01-01")).toEqual({ total: 3, highs: 1 });
  });
});

describe("pickHeadline", () => {
  const today = "2026-11-04";
  test("7일 2건 → 30일", () => {
    const items = [item("2026-11-03", 1), item("2026-11-01", 1), item("2026-10-20", 1), item("2026-10-15", 1), item("2026-10-10", 1)];
    const r = pickHeadline(items, today);
    expect(r.days).toBe(30);
    expect(r.items).toHaveLength(5);
  });
  test("7일 3건 → 7일", () => {
    const items = [item("2026-11-03", 1), item("2026-11-01", 1), item("2026-10-30", 1), item("2026-10-10", 1)];
    const r = pickHeadline(items, today);
    expect(r.days).toBe(7);
    expect(r.items).toHaveLength(3);
  });
});

describe("topJumps", () => {
  test("jump desc, n", () => {
    const items = [item("2026-11-01", 5), item("2026-11-01", 50), item("2026-11-01", 20), item("2026-11-01", 1)];
    expect(topJumps(items).map((i) => i.jump)).toEqual([50, 20, 5]);
    expect(topJumps(items, 1)).toHaveLength(1);
  });
});

describe("canceledIntro", () => {
  const today = "2026-11-04";
  const c = (d: string, city: CanceledHigh["city"]) => ({ ...item(d, 1), city });
  test("7일 기준이면 30일 건수를 괄호로, 0건 도시는 뺀다", () => {
    const items = [c("2026-11-03", "서울"), c("2026-11-01", "서울"), c("2026-10-30", "경기"), c("2026-10-10", "인천"), c("2026-09-01", "서울")];
    expect(canceledIntro(items, today)).toBe(
      "최근 7일 동안 수도권 아파트 신고가 3건이 신고 후 취소됐습니다(최근 30일 4건). 서울 2건, 경기 1건이며, 거래 해제는 대출 불발·계약 합의 해지 등 여러 이유로 생깁니다.",
    );
  });
  test("30일 기준이면 괄호 없음", () => {
    const items = [c("2026-10-20", "경기"), c("2026-10-15", "인천")];
    expect(canceledIntro(items, today)).toBe(
      "최근 30일 동안 수도권 아파트 신고가 2건이 신고 후 취소됐습니다. 경기 1건, 인천 1건이며, 거래 해제는 대출 불발·계약 합의 해지 등 여러 이유로 생깁니다.",
    );
  });
  test("0건", () => {
    expect(canceledIntro([], today)).toBe("최근 30일 수도권 아파트 신고가 중 취소된 거래가 없습니다.");
    expect(canceledIntro([c("2026-01-01", "서울")], today)).toBe("최근 30일 수도권 아파트 신고가 중 취소된 거래가 없습니다.");
  });
});
