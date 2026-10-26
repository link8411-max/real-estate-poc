import { describe, expect, test } from "vitest";
import { areaToPyeong, formatArea, formatDeal, formatManwon, formatPrice } from "@/lib/format";

describe("formatManwon", () => {
  test("억 단위", () => {
    expect(formatManwon(125000)).toBe("12억 5,000");
    expect(formatManwon(100000)).toBe("10억");
    expect(formatManwon(10000)).toBe("1억");
    expect(formatManwon(10500)).toBe("1억 500");
  });
  test("1억 미만", () => {
    expect(formatManwon(9500)).toBe("9,500");
    expect(formatManwon(0)).toBe("0");
  });
  test("음수", () => {
    expect(formatManwon(-125000)).toBe("-12억 5,000");
    expect(formatManwon(-500)).toBe("-500");
  });
});

test("areaToPyeong", () => {
  expect(areaToPyeong(84.99)).toBe(26);
  expect(areaToPyeong(59.96)).toBe(18);
});

test("formatDeal", () => {
  expect(formatDeal("2026-10-06")).toBe("26.10.06");
});

describe("formatArea", () => {
  test("버림 ㎡ + 전용 평 (평형 그룹과 같은 기준)", () => {
    expect(formatArea(84)).toBe("84㎡ (전용 25평)");
    expect(formatArea(84.88)).toBe("84㎡ (전용 25평)");
    expect(formatArea(59.53)).toBe("59㎡ (전용 18평)");
  });
});

describe("formatPrice", () => {
  test("단위 붙인 문장용 금액", () => {
    expect(formatPrice(245000)).toBe("24억 5,000만원");
    expect(formatPrice(100000)).toBe("10억원");
    expect(formatPrice(9500)).toBe("9,500만원");
  });
});
