import { describe, expect, test } from "vitest";
import { cullLabels, labelBox } from "../cullLabels";

type Item = { id: number; x: number; y: number; label: string; trade_count: number | null };
const project = (i: Item) => ({ x: i.x, y: i.y });
const run = (items: Item[]) => cullLabels(items, project, { label: (i) => i.label, weight: (i) => i.trade_count ?? 0 }).map((i) => i.id);

describe("labelBox", () => {
  test("텍스트 길이 × 7px + 16px 폭, 22px 높이, 점 중심", () => {
    // "12.3억" = 5자 → 5×7+16 = 51px
    expect(labelBox({ x: 100, y: 50 }, "12.3억")).toEqual({ left: 74.5, right: 125.5, top: 39, bottom: 61 });
  });
});

describe("두 줄 알약", () => {
  test("폭은 윗줄·아랫줄 중 긴 쪽, 높이는 32px", () => {
    // 윗줄 "래미안 · 25평": 한글 6자(60) + 공백·점 2×5.5(11) + 숫자 2×5.5(11)... 긴 쪽이 윗줄
    const b = labelBox({ x: 0, y: 0 }, "1억", "래미안 · 25평");
    expect(b.bottom - b.top).toBe(32);
    expect(b.right - b.left).toBeGreaterThan(5 * 7 + 16);
  });

  test("한 줄 추정으로는 안 겹치지만 두 줄 추정으로는 겹쳐 하나를 버린다", () => {
    const items: Item[] = [
      { id: 1, x: 0, y: 0, label: "9억", trade_count: 9 },
      { id: 2, x: 70, y: 0, label: "8억", trade_count: 1 },
    ];
    expect(run(items)).toEqual([1, 2]); // 한 줄: 폭 30px씩 → 안 겹침
    const two = cullLabels(items, project, { label: (i) => i.label, weight: (i) => i.trade_count ?? 0, top: () => "한양수자인 · 25평" });
    expect(two.map((i) => i.id)).toEqual([1]);
  });
});

describe("cullLabels", () => {
  test("겹치면 거래 수가 적은 라벨을 버린다", () => {
    const items: Item[] = [
      { id: 1, x: 100, y: 100, label: "12.3억", trade_count: 5 },
      { id: 2, x: 110, y: 105, label: "9.8억", trade_count: 50 },
    ];
    expect(run(items)).toEqual([2]);
  });

  test("겹치지 않으면 모두 남기고 거래 수 내림차순", () => {
    const items: Item[] = [
      { id: 1, x: 0, y: 0, label: "1억", trade_count: 1 },
      { id: 2, x: 200, y: 0, label: "2억", trade_count: 3 },
      { id: 3, x: 0, y: 100, label: "3억", trade_count: 2 },
    ];
    expect(run(items)).toEqual([2, 3, 1]);
  });

  test("겹침은 이미 남긴 라벨과만 비교한다(버린 라벨은 다른 라벨을 막지 않는다)", () => {
    // 1과 2가 겹치고, 2와 3이 겹치지만 1과 3은 안 겹친다 → 1, 3 유지
    const items: Item[] = [
      { id: 1, x: 0, y: 0, label: "10억", trade_count: 9 },
      { id: 2, x: 30, y: 0, label: "10억", trade_count: 5 },
      { id: 3, x: 60, y: 0, label: "10억", trade_count: 1 },
    ];
    expect(run(items)).toEqual([1, 3]);
  });

  test("거래 수 null은 0으로, 동률은 입력 순서 유지", () => {
    const items: Item[] = [
      { id: 1, x: 0, y: 0, label: "1억", trade_count: null },
      { id: 2, x: 5, y: 0, label: "1억", trade_count: null },
    ];
    expect(run(items)).toEqual([1]);
  });
});

describe("cullLabels occupied(다른 레이어가 차지한 자리)", () => {
  const items = [{ id: "a", x: 100 }, { id: "b", x: 400 }];
  const run = (weight: (i: { id: string }) => number) =>
    cullLabels(items, (i) => ({ x: i.x, y: 0 }), {
      label: () => "1억",
      weight,
      occupied: [labelBox({ x: 100, y: 0 }, "1억")],
    }).map((i) => i.id);
  test("차지한 자리와 겹치는 항목은 버린다", () => {
    expect(run(() => 1)).toEqual(["b"]);
  });
  test("가중치 무한(선택한 항목)은 겹쳐도 남는다", () => {
    expect(run((i) => (i.id === "a" ? Infinity : 1))).toEqual(["a", "b"]);
  });
});
