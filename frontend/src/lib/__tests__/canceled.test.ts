import { describe, expect, test } from "vitest";
import { analyzeCanceled, countSince, pickHeadline, toIsoDate, topJumps } from "@/lib/canceled";
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
